/**
 * Publicação de feed no Instagram via Content Publishing API.
 * Usa o mesmo token/conta já conectados em Integrações → Instagram, mas exige
 * o token ter a permissão `instagram_content_publish` (não só `instagram_manage_messages`).
 *
 * Fluxo: cria container(es) de mídia → aguarda ficar pronto → publica → busca o link.
 * Referência: https://developers.facebook.com/docs/instagram-platform/content-publishing
 */

const GRAPH = "https://graph.facebook.com/v19.0";

export class InstagramPublishError extends Error {}

async function graphFetch(path: string, params: Record<string, string>) {
  const url = `${GRAPH}/${path}?${new URLSearchParams(params).toString()}`;
  const res = await fetch(url, { method: "POST", signal: AbortSignal.timeout(15000) });
  const data = (await res.json()) as { id?: string; error?: { message: string; code?: number } };
  if (data.error) {
    throw new InstagramPublishError(
      data.error.code === 200 || data.error.code === 10
        ? "O token do Instagram não tem permissão para postar (instagram_content_publish). Reconecte em Integrações com essa permissão."
        : data.error.message,
    );
  }
  return data;
}

async function waitContainerReady(containerId: string, token: string) {
  for (let i = 0; i < 10; i++) {
    const res = await fetch(
      `${GRAPH}/${containerId}?fields=status_code&access_token=${token}`,
      { signal: AbortSignal.timeout(8000) },
    );
    const data = (await res.json()) as { status_code?: string; error?: { message: string } };
    if (data.error) throw new InstagramPublishError(data.error.message);
    if (data.status_code === "FINISHED") return;
    if (data.status_code === "ERROR") throw new InstagramPublishError("Falha ao processar a imagem no Instagram.");
    await new Promise(r => setTimeout(r, 1500));
  }
  throw new InstagramPublishError("Tempo esgotado aguardando o Instagram processar a imagem.");
}

export const instagramService = {
  /**
   * Publica um post de feed (foto única ou carrossel de até 10 fotos) e retorna o link do post.
   */
  async publishFeedPost({
    igUserId, token, imageUrls, caption,
  }: { igUserId: string; token: string; imageUrls: string[]; caption: string }): Promise<{ permalink: string | null; mediaId: string }> {
    const urls = imageUrls.slice(0, 10);
    if (urls.length === 0) throw new InstagramPublishError("O veículo não tem fotos para postar.");

    let creationId: string;

    if (urls.length === 1) {
      const container = await graphFetch(`${igUserId}/media`, {
        image_url: urls[0], caption, access_token: token,
      });
      creationId = container.id!;
      await waitContainerReady(creationId, token);
    } else {
      const childIds: string[] = [];
      for (const url of urls) {
        const child = await graphFetch(`${igUserId}/media`, {
          image_url: url, is_carousel_item: "true", access_token: token,
        });
        childIds.push(child.id!);
      }
      for (const childId of childIds) await waitContainerReady(childId, token);

      const carousel = await graphFetch(`${igUserId}/media`, {
        media_type: "CAROUSEL", children: childIds.join(","), caption, access_token: token,
      });
      creationId = carousel.id!;
      await waitContainerReady(creationId, token);
    }

    const published = await graphFetch(`${igUserId}/media_publish`, {
      creation_id: creationId, access_token: token,
    });
    const mediaId = published.id!;

    const permalinkRes = await fetch(
      `${GRAPH}/${mediaId}?fields=permalink&access_token=${token}`,
      { signal: AbortSignal.timeout(8000) },
    );
    const permalinkData = (await permalinkRes.json()) as { permalink?: string };

    return { permalink: permalinkData.permalink ?? null, mediaId };
  },
};

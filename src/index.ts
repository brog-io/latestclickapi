export interface Env {
  DISCORD_BOT_TOKEN: string;
  DISCORD_CHANNEL_ID: string;
}

type DiscordAttachment = {
  id: string;
  filename: string;
  content_type?: string;
  size: number;
  url: string;
  proxy_url: string;
  height?: number | null;
  width?: number | null;
};

type DiscordEmbedImage = {
  url?: string;
  proxy_url?: string;
  height?: number;
  width?: number;
};

type DiscordEmbed = {
  image?: DiscordEmbedImage;
  thumbnail?: DiscordEmbedImage;
};

type DiscordMessage = {
  id: string;
  channel_id: string;
  content: string;
  timestamp: string;
  attachments: DiscordAttachment[];
  embeds?: DiscordEmbed[];
};

function isImageAttachment(attachment: DiscordAttachment): boolean {
  if (attachment.content_type?.startsWith("image/")) {
    return true;
  }

  const lower = attachment.filename.toLowerCase();
  return (
    lower.endsWith(".png") ||
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".gif") ||
    lower.endsWith(".webp") ||
    lower.endsWith(".bmp") ||
    lower.endsWith(".svg") ||
    lower.endsWith(".avif")
  );
}

async function fetchChannelMessages(
  channelId: string,
  botToken: string,
  limit = 100,
  before?: string,
): Promise<DiscordMessage[]> {
  const url = new URL(
    `https://discord.com/api/v10/channels/${channelId}/messages`,
  );
  url.searchParams.set("limit", String(limit));

  if (before) {
    url.searchParams.set("before", before);
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bot ${botToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Discord API error ${response.status}: ${text}`);
  }

  return (await response.json()) as DiscordMessage[];
}

async function findLatestImageUrl(
  channelId: string,
  botToken: string,
  pagesToScan = 5,
): Promise<string | null> {
  let before: string | undefined;

  for (let page = 0; page < pagesToScan; page++) {
    const messages = await fetchChannelMessages(
      channelId,
      botToken,
      100,
      before,
    );

    if (messages.length === 0) {
      return null;
    }

    for (const message of messages) {
      for (const attachment of message.attachments ?? []) {
        if (isImageAttachment(attachment)) {
          return attachment.url;
        }
      }

      for (const embed of message.embeds ?? []) {
        if (embed.image?.url) {
          return embed.image.url;
        }

        if (embed.thumbnail?.url) {
          return embed.thumbnail.url;
        }
      }
    }

    before = messages[messages.length - 1].id;
  }

  return null;
}

function textResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/+$/, "");

    if (pathname !== "/latestclick") {
      return new Response("Not Found", { status: 404 });
    }

    if (!env.DISCORD_BOT_TOKEN) {
      return textResponse("Missing DISCORD_BOT_TOKEN", 500);
    }

    if (!env.DISCORD_CHANNEL_ID) {
      return textResponse("Missing DISCORD_CHANNEL_ID", 500);
    }

    try {
      const imageUrl = await findLatestImageUrl(
        env.DISCORD_CHANNEL_ID,
        env.DISCORD_BOT_TOKEN,
        5,
      );

      if (!imageUrl) {
        return textResponse("No image found", 404);
      }

      return Response.redirect(imageUrl, 302);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown error while fetching Discord messages";
      return textResponse(message, 500);
    }
  },
};

import type { Prisma } from "@prisma/client";
import { categoryIds, templates, type Config, type Template } from "@memeparty/shared";
import { freeTemplates } from "../../../packages/shared/src/freeTemplates.js";
import { communityTemplates } from "../../../packages/shared/src/communityTemplates.js";
import { db } from "./events.js";

const allSeedTemplates: Template[] = [...templates, ...freeTemplates, ...communityTemplates];

function providerOf(template: Template) {
  if (template.id.startsWith("justmeme-")) return "justmeme";
  if (template.id.startsWith("imgflip-")) return "imgflip";
  if (template.id.startsWith("memegenscript-")) return "memegenscript";
  return "memeparty";
}

export async function syncTemplateCatalog() {
  await db.template.createMany({
    skipDuplicates: true,
    data: allSeedTemplates.map((template) => {
      const aspectRatio = template.aspectRatio && template.aspectRatio > 0
        ? template.aspectRatio
        : 1;
      const provider = providerOf(template);
      return {
        id: template.id,
        name: template.name,
        description: template.source ?? null,
        mediaType: template.url.toLowerCase().endsWith(".png") ? "png" : "jpeg",
        storagePath: template.url,
        thumbnailPath: null,
        width: 1000,
        height: Math.max(1, Math.round(1000 / aspectRatio)),
        tags: template.categories,
        language: "und",
        rating: provider === "memeparty" || provider === "imgflip" ? "family" : "general",
        nsfw: false,
        active: true,
        provider,
        sourceUrl: template.source ?? null,
        moderationStatus:
          provider === "memeparty" || provider === "imgflip"
            ? "APPROVED"
            : "UNREVIEWED",
      };
    }),
  });
  const categoryGroups = new Map<string, string[]>();
  for (const template of allSeedTemplates) {
    const key = [...template.categories].sort().join(",");
    const ids = categoryGroups.get(key) ?? [];
    ids.push(template.id);
    categoryGroups.set(key, ids);
  }
  await Promise.all(
    [...categoryGroups].map(([key, ids]) =>
      db.template.updateMany({
        where: { id: { in: ids }, provider: { not: "upload" } },
        data: { tags: key.split(",").filter(Boolean) },
      }),
    ),
  );
}

export function catalogueWhere(config: Pick<Config, "categories" | "family">): Prisma.TemplateWhereInput {
  return {
    active: true,
    moderationStatus: { not: "REJECTED" },
    tags: { hasSome: config.categories },
    ...(config.family ? { nsfw: false, rating: { not: "adult" } } : {}),
  };
}

export async function templatePool(config: Pick<Config, "categories" | "family">) {
  const rows = await db.template.findMany({
    where: catalogueWhere(config),
    select: { id: true },
  });
  if (!rows.length) throw Error("NO_TEMPLATES");
  return rows.map((row) => row.id);
}

export const publicTemplateSelect = {
  id: true,
  name: true,
  description: true,
  mediaType: true,
  storagePath: true,
  thumbnailPath: true,
  width: true,
  height: true,
  tags: true,
  language: true,
  rating: true,
  provider: true,
  sourceUrl: true,
  moderationStatus: true,
} satisfies Prisma.TemplateSelect;

export function publicTemplate(template: {
  id: string;
  name: string;
  description: string | null;
  mediaType: string;
  storagePath: string;
  thumbnailPath: string | null;
  width: number;
  height: number;
  tags: string[];
  language: string;
  rating: string;
  provider: string;
  sourceUrl: string | null;
  moderationStatus: string;
}) {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    mediaType: template.mediaType,
    url: template.storagePath.startsWith("http") || template.storagePath.startsWith("/")
      ? template.storagePath
      : `/api/templates/${encodeURIComponent(template.id)}/image`,
    thumbnailUrl: template.thumbnailPath
      ? `/api/templates/${encodeURIComponent(template.id)}/image?thumbnail=1`
      : null,
    width: template.width,
    height: template.height,
    aspectRatio: template.height > 0 ? template.width / template.height : 1,
    categories: template.tags.filter((tag) =>
      (categoryIds as readonly string[]).includes(tag),
    ),
    language: template.language,
    rating: template.rating,
    provider: template.provider,
    source: template.sourceUrl,
    moderationStatus: template.moderationStatus,
  };
}

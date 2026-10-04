import { defineCollection, z } from 'astro:content';

const productSchema = z.object({
  name: z.string(),
  brand: z.string().optional(),
  rating: z.number().min(0).max(5).optional(),
  price: z.number().optional(),
  affiliateUrl: z.string().url(),
  // Opcional: várias lojas (ex.: Amazon + Mercado Livre). Quando presente, o card mostra
  // um botão por loja; sem ele, vale o affiliateUrl de sempre (posts antigos).
  stores: z
    .array(z.object({ store: z.enum(['amazon', 'mercadolivre', 'hotmart']), url: z.string().url() }))
    .optional(),
  image: z.string().optional(),
  pros: z.array(z.string()).optional(),
  cons: z.array(z.string()).optional(),
});

const posts = defineCollection({
  type: 'content',
  schema: ({ image }) =>
    z.object({
      title: z.string().max(70),
      description: z.string().max(160),
      pubDate: z.date(),
      updatedDate: z.date().optional(),
      image: image().optional(),
      imageAlt: z.string().optional(),
      category: z.enum([
        'furadeiras',
        'parafusadeiras',
        'serras',
        'lixadeiras',
        'medicao',
        'ferramentas-manuais',
        'jardinagem',
        'organizacao',
        'guias',
      ]),
      tags: z.array(z.string()).default([]),
      products: z.array(productSchema).default([]),
      faq: z
        .array(z.object({ question: z.string(), answer: z.string() }))
        .optional(),
      author: z.string().default('Equipe Editorial'),
      draft: z.boolean().default(false),
      featured: z.boolean().default(false),
    }),
});

export const collections = { posts };

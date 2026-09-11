import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const events = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/events' }),
  schema: z.object({
    issue: z.number().int().positive(),
    date: z.coerce.date(),
    time: z.string(),
    host: z.string(),
    speaker: z.string().optional(),
    affiliation: z.string().optional(),
    title: z.string().optional(),
    summary: z.string().optional(),
    reportType: z.enum(['工作进展', '研究动态', '研究动态与工作进展', '技能交流', '报告演练', '课程讲习', '工作会议', '其他']).optional(),
    location: z.string(),
    meetingUrl: z.url().optional(),
    meetingNumber: z.string().optional(),
    status: z.enum(['待定', '已公布', '已结束']),
    materials: z.array(z.object({ label: z.string(), url: z.string() })).default([]),
    sessions: z.array(z.object({
      speaker: z.string(),
      affiliation: z.string().optional(),
      time: z.string().optional(),
      type: z.enum(['工作进展', '研究动态', '研究动态与工作进展', '技能交流', '报告演练', '课程讲习', '工作会议', '其他']).optional(),
      title: z.string(),
      summary: z.string().optional()
    })).default([])
  })
});

const news = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/news' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    summary: z.string(),
    pinned: z.boolean().default(false),
    tags: z.array(z.string()).default([])
  })
});

const training = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/training' }),
  schema: z.object({
    title: z.string(),
    category: z.enum(['ASO-S', 'HXI', 'SDO', 'Solar Orbiter / STIX', 'SSWIDL', 'Python / SunPy', '数据分析教程']),
    summary: z.string(),
    order: z.number().default(100),
    resources: z.array(z.object({
      label: z.string(),
      type: z.enum(['PDF', '外部链接', '代码', '下载']),
      url: z.string()
    })).default([])
  })
});

const about = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/about' }),
  schema: z.object({
    title: z.string(),
    order: z.number().default(100)
  })
});

export const collections = { events, news, training, about };

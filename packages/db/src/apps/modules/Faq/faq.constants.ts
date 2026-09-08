export const faqSearchableFields = ['question', 'answer'] as const

export const faqSortableFields = ['createdAt', 'updatedAt', 'question', 'answer'] as const

// Types (optional but recommended)
export type TFaqSearchableField = (typeof faqSearchableFields)[number]

export type TFaqSortableField = (typeof faqSortableFields)[number]

export type ContentType = "book" | "article" | "song" | "poem"
export type DifficultyLevel = "beginner" | "intermediate" | "advanced"

export interface ContentItem {
  id: string
  title: string
  author: string
  type: ContentType
  difficulty: DifficultyLevel
  wordCount: number
  language: string
  coverImage: string
  tags: string[]
  preview: string
  estimatedTime: string
}

export const contentItems: ContentItem[] = [
  {
    id: "1",
    title: "The Little Prince",
    author: "Antoine de Saint-Exupéry",
    type: "book",
    difficulty: "beginner",
    wordCount: 16500,
    language: "French",
    coverImage:
      "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=400&h=600&fit=crop",
    tags: ["Classic", "Fantasy", "Philosophy"],
    preview:
      "Once when I was six years old I saw a magnificent picture in a book, called True Stories from Nature, about the primeval forest. It was a picture of a boa constrictor in the act of swallowing an animal. Here is a copy of the drawing. In the book it said: 'Boa constrictors swallow their prey whole, without chewing it. After that they are not able to move, and they sleep through the six months that they need for digestion.'",
    estimatedTime: "3 hours",
  },
  {
    id: "2",
    title: "The Road Not Taken",
    author: "Robert Frost",
    type: "poem",
    difficulty: "intermediate",
    wordCount: 250,
    language: "English",
    coverImage:
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=600&fit=crop",
    tags: ["Nature", "Choices", "Classic"],
    preview:
      "Two roads diverged in a yellow wood,\nAnd sorry I could not travel both\nAnd be one traveler, long I stood\nAnd looked down one as far as I could\nTo where it bent in the undergrowth;\n\nThen took the other, as just as fair,\nAnd having perhaps the better claim,\nBecause it was grassy and wanted wear;",
    estimatedTime: "5 min",
  },
  {
    id: "3",
    title: "Despacito",
    author: "Luis Fonsi",
    type: "song",
    difficulty: "beginner",
    wordCount: 420,
    language: "Spanish",
    coverImage:
      "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&h=600&fit=crop",
    tags: ["Pop", "Latin", "Romance"],
    preview:
      "Sí, sabes que ya llevo un rato mirándote\nTengo que bailar contigo hoy\nVi que tu mirada ya estaba llamándome\nMuéstrame el camino que yo voy\n\nTú, tú eres el imán y yo soy el metal\nMe voy acercando y voy armando el plan",
    estimatedTime: "4 min",
  },
  {
    id: "4",
    title: "Climate Change: A Global Challenge",
    author: "Nature Journal",
    type: "article",
    difficulty: "advanced",
    wordCount: 2800,
    language: "English",
    coverImage:
      "https://images.unsplash.com/photo-1569163139599-0f4517e36f51?w=400&h=600&fit=crop",
    tags: ["Science", "Environment", "Current Events"],
    preview:
      "The Earth's climate has changed throughout history. Just in the last 800,000 years, there have been eight cycles of ice ages and warmer periods, with the end of the last ice age about 11,700 years ago marking the beginning of the modern climate era and of human civilization. Most of these climate changes are attributed to very small variations in Earth's orbit that change the amount of solar energy our planet receives.",
    estimatedTime: "15 min",
  },
  {
    id: "5",
    title: "Kafka on the Shore",
    author: "Haruki Murakami",
    type: "book",
    difficulty: "advanced",
    wordCount: 125000,
    language: "Japanese",
    coverImage:
      "https://images.unsplash.com/photo-1532012197267-da84d127e765?w=400&h=600&fit=crop",
    tags: ["Surreal", "Coming-of-age", "Mystery"],
    preview:
      "On my fifteenth birthday I ran away from home. I stuffed my belongings in a backpack, stuck it in a coin locker in a train station, and waited for the library to open. I needed to find answers. Somewhere between the rows of books, I hoped to discover who I really was, and who I might become.",
    estimatedTime: "12 hours",
  },
  {
    id: "6",
    title: "Sonnet 18",
    author: "William Shakespeare",
    type: "poem",
    difficulty: "intermediate",
    wordCount: 114,
    language: "English",
    coverImage:
      "https://images.unsplash.com/photo-1474366521946-c3b0dfe4ba7e?w=400&h=600&fit=crop",
    tags: ["Romance", "Classic", "Sonnets"],
    preview:
      "Shall I compare thee to a summer's day?\nThou art more lovely and more temperate:\nRough winds do shake the darling buds of May,\nAnd summer's lease hath all too short a date:\n\nSometime too hot the eye of heaven shines,\nAnd often is his gold complexion dimm'd;",
    estimatedTime: "3 min",
  },
  {
    id: "7",
    title: "La Vie en Rose",
    author: "Édith Piaf",
    type: "song",
    difficulty: "intermediate",
    wordCount: 280,
    language: "French",
    coverImage:
      "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=600&fit=crop",
    tags: ["Classic", "Romance", "Jazz"],
    preview:
      "Des yeux qui font baisser les miens\nUn rire qui se perd sur sa bouche\nVoilà le portrait sans retouche\nDe l'homme auquel j'appartiens\n\nQuand il me prend dans ses bras\nIl me parle tout bas\nJe vois la vie en rose",
    estimatedTime: "4 min",
  },
  {
    id: "8",
    title: "The Art of Mindfulness",
    author: "Zen Magazine",
    type: "article",
    difficulty: "beginner",
    wordCount: 1200,
    language: "English",
    coverImage:
      "https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=400&h=600&fit=crop",
    tags: ["Wellness", "Meditation", "Lifestyle"],
    preview:
      "Mindfulness is the basic human ability to be fully present, aware of where we are and what we're doing, and not overly reactive or overwhelmed by what's going on around us. While mindfulness is something we all naturally possess, it's more readily available to us when we practice on a daily basis.",
    estimatedTime: "8 min",
  },
  {
    id: "9",
    title: "Cien años de soledad",
    author: "Gabriel García Márquez",
    type: "book",
    difficulty: "advanced",
    wordCount: 144000,
    language: "Spanish",
    coverImage:
      "https://images.unsplash.com/photo-1476275466078-4007374efbbe?w=400&h=600&fit=crop",
    tags: ["Magic Realism", "Epic", "Family Saga"],
    preview:
      "Muchos años después, frente al pelotón de fusilamiento, el coronel Aureliano Buendía había de recordar aquella tarde remota en que su padre lo llevó a conocer el hielo. Macondo era entonces una aldea de veinte casas de barro y cañabrava construidas a la orilla de un río de aguas diáfanas.",
    estimatedTime: "14 hours",
  },
  {
    id: "10",
    title: "99 Luftballons",
    author: "Nena",
    type: "song",
    difficulty: "intermediate",
    wordCount: 350,
    language: "German",
    coverImage:
      "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&h=600&fit=crop",
    tags: ["Pop", "80s", "Anti-war"],
    preview:
      "Hast du etwas Zeit für mich?\nDann singe ich ein Lied für dich\nVon neunundneunzig Luftballons\nAuf ihrem Weg zum Horizont\n\nDenkst du vielleicht grad an mich?\nDann singe ich ein Lied für dich",
    estimatedTime: "4 min",
  },
  {
    id: "11",
    title: "Still I Rise",
    author: "Maya Angelou",
    type: "poem",
    difficulty: "intermediate",
    wordCount: 320,
    language: "English",
    coverImage:
      "https://images.unsplash.com/photo-1507838153414-b4b713384a76?w=400&h=600&fit=crop",
    tags: ["Empowerment", "Civil Rights", "Modern"],
    preview:
      "You may write me down in history\nWith your bitter, twisted lies,\nYou may trod me in the very dirt\nBut still, like dust, I'll rise.\n\nDoes my sassiness upset you?\nWhy are you beset with gloom?\n'Cause I walk like I've got oil wells\nPumping in my living room.",
    estimatedTime: "5 min",
  },
  {
    id: "12",
    title: "The Future of AI in Education",
    author: "EdTech Weekly",
    type: "article",
    difficulty: "intermediate",
    wordCount: 1800,
    language: "English",
    coverImage:
      "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=400&h=600&fit=crop",
    tags: ["Technology", "Education", "Future"],
    preview:
      "Artificial intelligence is revolutionizing the way we learn and teach. From personalized learning paths to intelligent tutoring systems, AI is making education more accessible and effective than ever before. This article explores the current state of AI in education and what the future might hold.",
    estimatedTime: "10 min",
  },
]

export const contentTypeIcons: Record<ContentType, string> = {
  book: "BookOpen",
  article: "FileText",
  song: "Music",
  poem: "Feather",
}

export const difficultyColors: Record<DifficultyLevel, string> = {
  beginner:
    "bg-emerald-500/18 text-emerald-950 border-emerald-700/30 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30",
  intermediate:
    "bg-amber-400/78 text-amber-950 border-amber-700/45 dark:bg-amber-400/42 dark:text-amber-100 dark:border-amber-300/45",
  advanced:
    "bg-rose-500/18 text-rose-950 border-rose-700/30 dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/30",
}

/** Short labels for type pills (featured grid, cards, preview). */
export const contentTypeLabels: Record<ContentType, string> = {
  book: "Book",
  article: "Article",
  song: "Song",
  poem: "Poem",
}

/**
 * Distinct but soft tints so types scan quickly on covers and in the modal.
 */
export const contentTypeBadgeClassNames: Record<ContentType, string> = {
  book:
    "border-amber-600/60 bg-amber-500/45 text-amber-950 shadow-sm dark:border-amber-400/60 dark:bg-amber-500/50 dark:text-amber-50",
  article:
    "border-sky-600/60 bg-sky-500/40 text-sky-950 shadow-sm dark:border-sky-400/60 dark:bg-sky-500/45 dark:text-sky-50",
  song:
    "border-violet-600/60 bg-violet-500/40 text-violet-950 shadow-sm dark:border-violet-400/60 dark:bg-violet-500/45 dark:text-violet-50",
  poem:
    "border-emerald-600/60 bg-emerald-500/40 text-emerald-950 shadow-sm dark:border-emerald-400/60 dark:bg-emerald-500/45 dark:text-emerald-50",
}

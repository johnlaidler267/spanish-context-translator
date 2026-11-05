/**
 * Mini lessons: one grammar idea, a couple of teaching screens, then practice.
 *
 * Written as data so a new lesson is just text. Inline markup in any text field:
 * `**word**` highlights a form (the thing being taught), `_phrase_` sets the target language in italics.
 * Typed steps name verb + tense + person; the expected form comes from conjugation.ts.
 */
import type { Person, TenseId } from "@/lib/learn/conjugation"
import type { LearningLanguage } from "@/lib/storage/language-learning-preferences"

export type TeachBlock =
  | { type: "text"; text: string }
  | { type: "pattern"; parts: { text: string; key?: boolean }[] }
  /** `target` is the line in the language being learned; `en` its English meaning. */
  | { type: "example"; label?: string; target: string; en: string }
  | { type: "note"; text: string }

export type LessonStep =
  | { kind: "teach"; title: string; blocks: TeachBlock[] }
  | { kind: "choice"; text: string; options: { text: string; right?: boolean; why: string }[] }
  /** Graded by the Spanish conjugation engine, so only Spanish lessons use typed steps. */
  | { kind: "type"; prompt: string; text: string; verb: string; tense: TenseId; person: Person }

export const LESSON_LEVELS = ["beginner", "intermediate", "advanced"] as const
export type LessonLevel = (typeof LESSON_LEVELS)[number]

export const LESSON_LEVEL_NAME: Record<LessonLevel, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
}

/** Languages with their own lesson list. */
export type LessonLanguage = "spanish" | "french"

export type Lesson = {
  id: string
  language: LessonLanguage
  title: string
  level: LessonLevel
  /** One line in the lesson's language that shows what the lesson is about. */
  sample: string
  minutes: number
  steps: LessonStep[]
  /** `drill` hands off to a one-off conjugation round of these tenses. */
  finish: { title: string; recap: string[]; drill?: { tenses: TenseId[]; label: string } }
}

const SI_CLAUSES: Lesson = {
  id: "si-clauses",
  language: "spanish",
  level: "advanced",
  title: "If I had…",
  sample: "Si tuviera tiempo, viajaría.",
  minutes: 4,
  steps: [
    {
      kind: "teach",
      title: "Talking about what isn't true",
      blocks: [
        { type: "text", text: "To imagine a situation that isn't real right now, Spanish uses two parts." },
        {
          type: "pattern",
          parts: [{ text: "si" }, { text: "imperfect subjunctive", key: true }, { text: "conditional", key: true }],
        },
        { type: "example", target: "Si **tuviera** más tiempo, **leería** más.", en: "If I had more time, I'd read more." },
        {
          type: "example",
          target: "Si **viviéramos** en Madrid, **iríamos** al Prado cada semana.",
          en: "If we lived in Madrid, we'd go to the Prado every week.",
        },
        { type: "note", text: "The order can flip: _Leería más si tuviera tiempo._" },
      ],
    },
    {
      kind: "teach",
      title: "Possible or imagined?",
      blocks: [
        { type: "text", text: "If the situation could really happen, keep it simple: present after _si_, then future or present." },
        { type: "example", label: "Possible", target: "Si **tengo** tiempo, **leeré**.", en: "If I have time, I'll read. (I might.)" },
        { type: "example", label: "Imagined", target: "Si **tuviera** tiempo, **leería**.", en: "If I had time, I'd read. (I don't.)" },
        { type: "note", text: "One rule that never bends: the conditional never comes right after _si_." },
      ],
    },
    {
      kind: "choice",
      text: "Si yo ___ rico, viajaría por todo el mundo.",
      options: [
        { text: "fuera", right: true, why: "An imagined situation, so imperfect subjunctive after si." },
        { text: "era", why: "Era is the imperfect indicative: it describes the past, not something imagined." },
        { text: "sería", why: "The conditional belongs in the other half (viajaría). It never comes right after si." },
      ],
    },
    {
      kind: "choice",
      text: "Si mañana hace sol, ___ a la playa.",
      options: [
        { text: "iremos", right: true, why: "Hace (present) means a real possibility, so the result is plain future." },
        { text: "iríamos", why: "The conditional is for imagined situations. Hace sol is a real possibility, so use the future." },
        { text: "fuéramos", why: "The subjunctive goes after si, and only for something imagined. Here the result needs the future." },
      ],
    },
    { kind: "type", prompt: "Your turn", text: "Si nosotros ___ cerca del mar, nadaríamos cada día.", verb: "vivir", tense: "impsubj", person: 3 },
    { kind: "type", prompt: "Your turn", text: "Si ella ___, te ayudaría.", verb: "poder", tense: "impsubj", person: 2 },
    { kind: "type", prompt: "Now the other half", text: "Si tuviera hambre, ___ algo.", verb: "comer", tense: "conditional", person: 0 },
  ],
  finish: {
    title: "You can talk about what isn't true",
    recap: [
      "Imagined: _si_ + imperfect subjunctive, then conditional.",
      "Possible: _si_ + present, then future or present.",
      "Never put the conditional right after _si_.",
    ],
    drill: { tenses: ["impsubj"], label: "Drill the imperfect subjunctive" },
  },
}

const SER_ESTAR: Lesson = {
  id: "ser-estar",
  language: "spanish",
  level: "beginner",
  title: "Ser or estar",
  sample: "Es aburrido / está aburrido.",
  minutes: 5,
  steps: [
    {
      kind: "teach",
      title: "Two verbs for “to be”",
      blocks: [
        {
          type: "text",
          text: "Spanish splits “to be” in two. **Ser** says what something is: identity, origin, job, time, what it's made of. **Estar** says where it is or how it is right now.",
        },
        { type: "example", label: "Ser", target: "Mi madre **es** médica.", en: "My mother is a doctor." },
        { type: "example", label: "Estar", target: "Mi madre **está** cansada.", en: "My mother is tired." },
        { type: "note", text: "A quick test: is it what the thing is, or how it's doing?" },
      ],
    },
    {
      kind: "teach",
      title: "Same word, different meaning",
      blocks: [
        { type: "text", text: "Some adjectives change meaning depending on which verb they follow." },
        { type: "example", target: "La película **es** aburrida.", en: "The film is boring." },
        { type: "example", target: "**Estoy** aburrido.", en: "I'm bored." },
        { type: "example", target: "Juan **es** listo. / Juan **está** listo.", en: "Juan is clever. / Juan is ready." },
        {
          type: "note",
          text: "Two exceptions to memorize: where an event takes place uses ser (_La fiesta es en mi casa_), and _muerto_ takes estar (_El pez está muerto_).",
        },
      ],
    },
    {
      kind: "choice",
      text: "Madrid ___ en España.",
      options: [
        { text: "está", right: true, why: "Where a place is: estar." },
        { text: "es", why: "Ser says what something is. For where something is, use estar." },
      ],
    },
    {
      kind: "choice",
      text: "La fiesta ___ en mi casa el sábado.",
      options: [
        { text: "es", right: true, why: "Where an event takes place uses ser. It's the classic exception." },
        { text: "está", why: "Estar is for where things and people are. Events are the exception: they take ser." },
      ],
    },
    {
      kind: "choice",
      text: "No puedo salir hoy, ___ enferma.",
      options: [
        { text: "estoy", right: true, why: "Being sick is a condition, so estar." },
        { text: "soy", why: "Ser would make being sick part of who you are. A condition takes estar." },
      ],
    },
    {
      kind: "choice",
      text: "Mi hermano ___ muy listo: siempre saca buenas notas.",
      options: [
        { text: "es", right: true, why: "Ser + listo means clever, which fits the good grades." },
        { text: "está", why: "Estar + listo means ready. Good grades point to clever, which takes ser." },
      ],
    },
    { kind: "type", prompt: "Your turn", text: "Mis padres ___ de Colombia.", verb: "ser", tense: "present", person: 5 },
    { kind: "type", prompt: "Your turn", text: "¿Dónde ___ las llaves?", verb: "estar", tense: "present", person: 5 },
  ],
  finish: {
    title: "You can choose between ser and estar",
    recap: [
      "_Ser_: identity, origin, job, time, and where events happen.",
      "_Estar_: location and how things are right now.",
      "Some adjectives change meaning: _es listo_ (clever), _está listo_ (ready).",
    ],
    drill: { tenses: ["present"], label: "Drill the present tense" },
  },
}

const PRETERITE_IMPERFECT: Lesson = {
  id: "preterite-imperfect",
  language: "spanish",
  level: "intermediate",
  title: "Preterite or imperfect",
  sample: "Llovía cuando salí.",
  minutes: 5,
  steps: [
    {
      kind: "teach",
      title: "Two pasts, two jobs",
      blocks: [
        {
          type: "text",
          text: "Spanish has two simple past tenses. The **preterite** tells what happened: finished events. The **imperfect** sets the scene: what was going on, what used to happen, what things were like.",
        },
        { type: "example", label: "Preterite", target: "Ayer **comí** paella.", en: "Yesterday I ate paella." },
        {
          type: "example",
          label: "Imperfect",
          target: "De niño **comía** paella los domingos.",
          en: "As a kid I used to eat paella on Sundays.",
        },
        { type: "note", text: "Think of a film: the imperfect is the background, the preterite is the action." },
      ],
    },
    {
      kind: "teach",
      title: "Together in one sentence",
      blocks: [
        { type: "text", text: "They often meet: the imperfect sets up what was going on, and the preterite interrupts it." },
        { type: "example", target: "**Llovía** cuando **salí** de casa.", en: "It was raining when I left the house." },
        { type: "example", target: "Mientras **leía**, **sonó** el teléfono.", en: "While I was reading, the phone rang." },
        {
          type: "note",
          text: "Clue words help: _ayer, anoche, de repente_ point to the preterite; _siempre, de niño, mientras_ to the imperfect.",
        },
      ],
    },
    {
      kind: "choice",
      text: "Cuando era pequeña, ___ en un pueblo.",
      options: [
        { text: "vivía", right: true, why: "How things used to be is background, so imperfect." },
        { text: "viví", why: "The preterite makes it one finished event. Cuando era pequeña describes a stretch of time." },
      ],
    },
    {
      kind: "choice",
      text: "Anoche ___ una película muy buena.",
      options: [
        { text: "vi", right: true, why: "Anoche marks one finished event: preterite." },
        { text: "veía", why: "The imperfect describes something ongoing or habitual, not one film last night." },
      ],
    },
    {
      kind: "choice",
      text: "Mientras yo ___, mi hermano cocinaba.",
      options: [
        { text: "trabajaba", right: true, why: "Two actions in progress side by side: both imperfect." },
        { text: "trabajé", why: "The preterite would make your work a finished event. Mientras sets up something in progress." },
      ],
    },
    { kind: "type", prompt: "Your turn", text: "De repente, alguien ___ a la puerta.", verb: "llamar", tense: "preterite", person: 2 },
    { kind: "type", prompt: "Your turn", text: "Todos los veranos mis abuelos nos ___ a la playa.", verb: "llevar", tense: "imperfect", person: 5 },
    { kind: "type", prompt: "Your turn", text: "Ayer ___ tarde al trabajo.", verb: "llegar", tense: "preterite", person: 0 },
  ],
  finish: {
    title: "You can tell the two pasts apart",
    recap: [
      "Preterite: finished events, often with a clear time (_ayer, anoche_).",
      "Imperfect: background, habits and descriptions (_siempre, de niño, mientras_).",
      "Together: the imperfect sets the scene, the preterite interrupts it.",
    ],
    drill: { tenses: ["preterite", "imperfect"], label: "Drill both pasts" },
  },
}

const POR_PARA: Lesson = {
  id: "por-para",
  language: "spanish",
  level: "beginner",
  title: "Por or para",
  sample: "Gracias por todo. Es para ti.",
  minutes: 4,
  steps: [
    {
      kind: "teach",
      title: "Two ways to say “for”",
      blocks: [
        {
          type: "text",
          text: "**Para** points ahead: a goal, a recipient, a destination, a deadline. **Por** explains why or how: a cause, an exchange, a route, a means.",
        },
        { type: "example", label: "Para", target: "Este regalo es **para** ti.", en: "This gift is for you." },
        { type: "example", label: "Para", target: "Estudio **para** aprender.", en: "I study (in order) to learn." },
        { type: "example", label: "Por", target: "Gracias **por** todo.", en: "Thanks for everything." },
        { type: "example", label: "Por", target: "Caminamos **por** el parque.", en: "We walked through the park." },
      ],
    },
    {
      kind: "teach",
      title: "A few more of each",
      blocks: [
        { type: "example", label: "Exchange", target: "Pagué diez euros **por** el libro.", en: "I paid ten euros for the book." },
        { type: "example", label: "Means", target: "Te llamo **por** teléfono.", en: "I'll call you on the phone." },
        { type: "example", label: "Deadline", target: "El informe es **para** el lunes.", en: "The report is due Monday." },
        { type: "example", label: "Destination", target: "Mañana salgo **para** Lima.", en: "Tomorrow I leave for Lima." },
        { type: "note", text: "Quick check: is it pointing ahead (_para_) or explaining why or how (_por_)?" },
      ],
    },
    {
      kind: "choice",
      text: "Salimos ___ Madrid mañana por la mañana.",
      options: [
        { text: "para", right: true, why: "A destination: para." },
        { text: "por", why: "Por Madrid would mean through or around Madrid, not heading there." },
      ],
    },
    {
      kind: "choice",
      text: "Muchas gracias ___ tu ayuda.",
      options: [
        { text: "por", right: true, why: "Thanks look back at the cause: por." },
        { text: "para", why: "Para points to a goal or recipient. What you're thankful for is a cause, so por." },
      ],
    },
    {
      kind: "choice",
      text: "Necesito el informe ___ el viernes.",
      options: [
        { text: "para", right: true, why: "A deadline: para." },
        { text: "por", why: "Por with a time gives a rough period, not a deadline. “By Friday” is para." },
      ],
    },
    {
      kind: "choice",
      text: "Cambié mi bicicleta ___ una guitarra.",
      options: [
        { text: "por", right: true, why: "A swap or exchange: por." },
        { text: "para", why: "Para would mean the bike was meant for a guitar. An exchange takes por." },
      ],
    },
  ],
  finish: {
    title: "You can choose between por and para",
    recap: [
      "_Para_: goals, recipients, destinations, deadlines.",
      "_Por_: causes and thanks, exchanges, routes, means.",
      "Pointing ahead is _para_; explaining why or how is _por_.",
    ],
  },
}

const OJALA: Lesson = {
  id: "ojala",
  language: "spanish",
  level: "intermediate",
  title: "Wishes and hopes",
  sample: "Ojalá que llueva.",
  minutes: 4,
  steps: [
    {
      kind: "teach",
      title: "Ojalá: I hope, if only",
      blocks: [
        {
          type: "text",
          text: "_Ojalá_ means “I hope” or “if only.” It comes from Arabic (“God willing”), it never changes form, and the verb after it is always subjunctive.",
        },
        { type: "example", target: "Ojalá **llueva** mañana.", en: "I hope it rains tomorrow." },
        { type: "example", target: "Ojalá que **puedas** venir.", en: "I hope you can come." },
        { type: "note", text: "The _que_ is optional: _Ojalá venga_ and _Ojalá que venga_ mean the same." },
      ],
    },
    {
      kind: "teach",
      title: "A hope or a wish?",
      blocks: [
        { type: "text", text: "The subjunctive's tense shows how likely you think it is." },
        { type: "example", label: "Possible", target: "Ojalá **tenga** tiempo.", en: "I hope I have time." },
        { type: "example", label: "Unlikely", target: "Ojalá **tuviera** tiempo.", en: "I wish I had time." },
        {
          type: "note",
          text: "_Espero que_ (I hope that) works the same way for real hopes: _Espero que estés bien._",
        },
      ],
    },
    {
      kind: "choice",
      text: "Ojalá ___ buen tiempo el fin de semana.",
      options: [
        { text: "haga", right: true, why: "Ojalá always takes the subjunctive, and this is a real hope, so present." },
        { text: "hace", why: "Hace is indicative. After ojalá the verb is always subjunctive." },
        { text: "hará", why: "The future is indicative too. Ojalá needs the subjunctive." },
      ],
    },
    {
      kind: "choice",
      text: "No tengo coche. ¡Ojalá ___ uno!",
      options: [
        { text: "tuviera", right: true, why: "You don't have one, so it's a wish about what isn't so: imperfect subjunctive." },
        { text: "tenga", why: "Tenga hopes for something possible. You've just said you don't have a car." },
      ],
    },
    { kind: "type", prompt: "Your turn", text: "Espero que ___ bien.", verb: "estar", tense: "subj", person: 1 },
    { kind: "type", prompt: "Your turn", text: "Ojalá que ellos ___ pronto.", verb: "volver", tense: "subj", person: 5 },
    { kind: "type", prompt: "Now a wish", text: "Ojalá ___ hablar japonés.", verb: "saber", tense: "impsubj", person: 0 },
  ],
  finish: {
    title: "You can hope and wish in Spanish",
    recap: [
      "_Ojalá (que)_ is always followed by the subjunctive.",
      "Present subjunctive for real hopes: _Ojalá tenga tiempo._",
      "Imperfect subjunctive for wishes about what isn't so: _Ojalá tuviera tiempo._",
    ],
    drill: { tenses: ["subj", "impsubj"], label: "Drill the subjunctive" },
  },
}

const FR_TU_VOUS: Lesson = {
  id: "fr-tu-vous",
  language: "french",
  level: "beginner",
  title: "Tu or vous",
  sample: "Tu viens ? / Vous venez ?",
  minutes: 4,
  steps: [
    {
      kind: "teach",
      title: "Two ways to say “you”",
      blocks: [
        { type: "text", text: "French has two words for “you”, and picking one says how well you know the person." },
        {
          type: "text",
          text: "Use **tu** with one person you know well: a friend, family, a child. Use **vous** with someone you don't know well, or with any group.",
        },
        { type: "example", target: "**Tu** as faim ?", en: "Are you hungry? (to a friend)" },
        { type: "example", target: "**Vous** avez l'heure, s'il vous plaît ?", en: "Do you have the time, please? (to a stranger)" },
        { type: "example", target: "Les enfants, **vous** êtes prêts ?", en: "Kids, are you ready?" },
        { type: "note", text: "_Vous_ is also the plural: talking to a group, even of friends, always use _vous_." },
      ],
    },
    {
      kind: "teach",
      title: "The verb changes too",
      blocks: [
        { type: "text", text: "The verb ending follows the pronoun, so it's a second clue to which one you need." },
        { type: "example", target: "tu **parles** · vous **parlez**", en: "you speak" },
        { type: "example", target: "tu **es** · vous **êtes**", en: "you are" },
        { type: "example", target: "tu **as** · vous **avez**", en: "you have" },
        {
          type: "note",
          text: "With an adult you've just met, start with _vous_. If they'd rather use _tu_, they'll say so: _On peut se tutoyer ?_",
        },
      ],
    },
    {
      kind: "choice",
      text: "Bonjour madame, ___ cherchez quelque chose ?",
      options: [
        { text: "vous", right: true, why: "A shop assistant speaks to a customer with vous, and cherchez is the vous form." },
        { text: "tu", why: "Cherchez ends in -ez, which goes with vous. Staff also speak to customers with vous." },
      ],
    },
    {
      kind: "choice",
      text: "Maman, ___ veux un café ?",
      options: [
        { text: "tu", right: true, why: "Most families use tu with each other, and veux is the tu form." },
        { text: "vous", why: "Vous would need voulez. And with one parent you normally use tu." },
      ],
    },
    {
      kind: "choice",
      text: "Paul et Marie, ___ venez ce soir ?",
      options: [
        { text: "vous", right: true, why: "Two people, so vous, even though they're friends." },
        { text: "tu", why: "Tu is for one person only. Talking to Paul and Marie together takes vous." },
      ],
    },
    {
      kind: "choice",
      text: "Excusez-moi, monsieur, vous ___ anglais ?",
      options: [
        { text: "parlez", right: true, why: "Vous takes the -ez ending: vous parlez." },
        { text: "parles", why: "Parles is the tu form. With vous it's parlez." },
      ],
    },
  ],
  finish: {
    title: "You can choose between tu and vous",
    recap: [
      "_Tu_: one person you know well, or a child.",
      "_Vous_: someone you don't know well, or any group.",
      "The verb changes with it: _tu parles_, _vous parlez_.",
    ],
  },
}

const FR_ARTICLES: Lesson = {
  id: "fr-articles",
  language: "french",
  level: "beginner",
  title: "Le, la, les",
  sample: "le livre, la table, les clés",
  minutes: 4,
  steps: [
    {
      kind: "teach",
      title: "Every noun has a gender",
      blocks: [
        { type: "text", text: "Every French noun is masculine or feminine, and the word for “the” shows which." },
        { type: "example", label: "Masculine", target: "**le** livre", en: "the book" },
        { type: "example", label: "Feminine", target: "**la** table", en: "the table" },
        { type: "example", label: "Plural", target: "**les** livres, **les** tables", en: "the books, the tables" },
        { type: "note", text: "Before a vowel or a silent h, le and la both shorten to l': _l'ami_, _l'école_, _l'hôtel_." },
      ],
    },
    {
      kind: "teach",
      title: "“A” and “some”",
      blocks: [
        { type: "text", text: "“A” follows the gender too: **un** for masculine, **une** for feminine, and **des** (“some”) for plural." },
        { type: "example", target: "**un** chat et **une** souris", en: "a cat and a mouse" },
        { type: "example", target: "J'ai **des** amis à Paris.", en: "I have friends in Paris." },
        { type: "note", text: "English often leaves plurals bare, but French always puts a word in front: _des amis_." },
        { type: "note", text: "Learn each noun with its article: not just _livre_, but _le livre_." },
      ],
    },
    {
      kind: "choice",
      text: "J'ouvre ___ porte.",
      options: [
        { text: "la", right: true, why: "Porte is feminine, so “the door” is la porte." },
        { text: "le", why: "Le is for masculine nouns. Porte is feminine." },
        { text: "les", why: "Les is for more than one. Here it's a single door." },
      ],
    },
    {
      kind: "choice",
      text: "Il y a ___ chien dans le jardin.",
      options: [
        { text: "un", right: true, why: "Chien is masculine and there's one of it: un chien." },
        { text: "une", why: "Une is for feminine nouns. Chien is masculine." },
        { text: "des", why: "Des means “some”, for more than one. Here it's one dog." },
      ],
    },
    {
      kind: "choice",
      text: "Nous avons ___ questions.",
      options: [
        { text: "des", right: true, why: "More than one question, and no particular ones: des." },
        { text: "une", why: "Une is for one thing. Questions is plural." },
        { text: "la", why: "La is singular. Questions is plural, so it needs des (or les)." },
      ],
    },
    {
      kind: "choice",
      text: "Où sont ___ clés de la voiture ?",
      options: [
        { text: "les", right: true, why: "Particular keys (the car keys), and more than one: les." },
        { text: "la", why: "La is singular. Clés is plural." },
        { text: "des", why: "Des is “some”. These are particular keys, the car's, so it's les." },
      ],
    },
  ],
  finish: {
    title: "You can say “the” and “a” in French",
    recap: [
      "_le_ (masculine), _la_ (feminine), _les_ (plural): “the”.",
      "_un_, _une_, _des_: “a” and “some”.",
      "Before a vowel, le and la become l': _l'ami_, _l'école_.",
    ],
  },
}

const FR_NEGATION: Lesson = {
  id: "fr-negation",
  language: "french",
  level: "beginner",
  title: "Saying no",
  sample: "Je ne parle pas allemand.",
  minutes: 4,
  steps: [
    {
      kind: "teach",
      title: "Wrap the verb",
      blocks: [
        { type: "text", text: "To make a sentence negative, put **ne** before the verb and **pas** after it." },
        { type: "example", target: "Je **ne** parle **pas** allemand.", en: "I don't speak German." },
        { type: "example", target: "Elle **n'**aime **pas** le café.", en: "She doesn't like coffee." },
        { type: "note", text: "Ne becomes n' before a vowel: _je n'ai pas_." },
        { type: "note", text: "After a negative, un, une and des become de: _Je n'ai pas de voiture._" },
      ],
    },
    {
      kind: "teach",
      title: "Never, anymore, nothing",
      blocks: [
        { type: "text", text: "Swap pas for another word to change the meaning. Ne stays where it is." },
        { type: "example", target: "Il **ne** mange **jamais** de viande.", en: "He never eats meat." },
        { type: "example", target: "Je **ne** fume **plus**.", en: "I don't smoke anymore." },
        { type: "example", target: "Nous **ne** voyons **rien**.", en: "We can't see anything." },
        { type: "note", text: "In casual speech people often drop ne: _Je sais pas._ Keep it when you write." },
      ],
    },
    {
      kind: "choice",
      text: "Je ___ comprends pas.",
      options: [
        { text: "ne", right: true, why: "Pas comes after the verb, and ne goes before it." },
        { text: "pas", why: "Pas is already after the verb. The word before it is ne." },
        { text: "non", why: "Non answers a question on its own. Inside a sentence, use ne… pas." },
      ],
    },
    {
      kind: "choice",
      text: "J'ai arrêté de fumer : je ne fume ___.",
      options: [
        { text: "plus", right: true, why: "You used to smoke and stopped: ne… plus, “not anymore”." },
        { text: "jamais", why: "Ne… jamais means you never did. But you've just said you stopped." },
        { text: "rien", why: "Ne… rien means “nothing”. Here you need “not anymore”." },
      ],
    },
    {
      kind: "choice",
      text: "Désolé, je n'ai pas ___ voiture.",
      options: [
        { text: "de", right: true, why: "After a negative, une becomes de: pas de voiture." },
        { text: "une", why: "After pas, un and une usually become de." },
        { text: "la", why: "La would mean a particular car. “I don't have a car” is pas de voiture." },
      ],
    },
    {
      kind: "choice",
      text: "Il fait noir, on ne voit ___.",
      options: [
        { text: "rien", right: true, why: "It's dark, so you see nothing: ne… rien." },
        { text: "plus", why: "Ne… plus means “not anymore”. Possible, but the dark means you see nothing at all." },
        { text: "pas rien", why: "Rien takes the place of pas. It's never pas rien." },
      ],
    },
  ],
  finish: {
    title: "You can say no in French",
    recap: [
      "Wrap the verb: _ne_ + verb + _pas_.",
      "Swap pas for _jamais_ (never), _plus_ (anymore), _rien_ (nothing).",
      "After a negative, un, une and des become _de_.",
    ],
  },
}

const FR_AU_DU: Lesson = {
  id: "fr-au-du",
  language: "french",
  level: "beginner",
  title: "Au, du",
  sample: "Je vais au cinéma.",
  minutes: 4,
  steps: [
    {
      kind: "teach",
      title: "À + le = au",
      blocks: [
        { type: "text", text: "À (to, at) merges with le and les into one word: à + le = **au**, à + les = **aux**." },
        { type: "example", target: "Je vais **au** cinéma.", en: "I'm going to the cinema." },
        { type: "example", target: "Elle parle **aux** enfants.", en: "She's talking to the children." },
        { type: "example", target: "On va **à la** plage.", en: "We're going to the beach." },
        { type: "note", text: "Only le and les merge. _À la_ and _à l'_ never change: _à l'école_." },
      ],
    },
    {
      kind: "teach",
      title: "De + le = du",
      blocks: [
        { type: "text", text: "De (of, from) follows the same rule: de + le = **du**, de + les = **des**." },
        { type: "example", target: "Je reviens **du** marché.", en: "I'm coming back from the market." },
        { type: "example", target: "la chambre **des** enfants", en: "the children's room" },
        { type: "example", target: "la porte **de la** maison", en: "the door of the house" },
        { type: "note", text: "Again, _de la_ and _de l'_ stay as they are." },
      ],
    },
    {
      kind: "choice",
      text: "Ce soir, nous allons ___ restaurant.",
      options: [
        { text: "au", right: true, why: "Restaurant is masculine (le restaurant), and à + le makes au." },
        { text: "à le", why: "À le always merges into au." },
        { text: "à la", why: "Restaurant is masculine, so it's le, and à + le makes au." },
      ],
    },
    {
      kind: "choice",
      text: "Mon frère habite ___ États-Unis.",
      options: [
        { text: "aux", right: true, why: "It's les États-Unis, and à + les makes aux." },
        { text: "au", why: "Au is à + le. États-Unis is plural (les), so it's aux." },
        { text: "à les", why: "À les always merges into aux." },
      ],
    },
    {
      kind: "choice",
      text: "Elle sort ___ bureau à six heures.",
      options: [
        { text: "du", right: true, why: "Bureau is masculine (le bureau), and de + le makes du." },
        { text: "de le", why: "De le always merges into du." },
        { text: "de la", why: "Bureau is masculine, so de + le makes du." },
      ],
    },
    {
      kind: "choice",
      text: "Tu as le numéro ___ pharmacie ?",
      options: [
        { text: "de la", right: true, why: "Pharmacie is feminine. Only le and les merge, so de la stays." },
        { text: "du", why: "Du is de + le. Pharmacie is feminine (la pharmacie)." },
        { text: "des", why: "Des is de + les, for plural. Here it's one pharmacy." },
      ],
    },
  ],
  finish: {
    title: "You can use au and du",
    recap: [
      "_à + le = au_, _à + les = aux_.",
      "_de + le = du_, _de + les = des_.",
      "_À la_, _à l'_, _de la_ and _de l'_ never change.",
    ],
  },
}

/**
 * Per language, in suggested order: easiest first, so the list's level groups read top to
 * bottom in this order, and the "Up next" lesson is the first one not finished yet.
 */
const LESSONS_BY_LANGUAGE: Record<LessonLanguage, Lesson[]> = {
  spanish: [SER_ESTAR, POR_PARA, PRETERITE_IMPERFECT, OJALA, SI_CLAUSES],
  french: [FR_TU_VOUS, FR_ARTICLES, FR_NEGATION, FR_AU_DU],
}

export const LESSONS: Lesson[] = Object.values(LESSONS_BY_LANGUAGE).flat()

/** Learning languages that have lessons; the Learn hub and lesson list open for these. */
export const LESSON_LANGUAGES: LearningLanguage[] = ["spanish", "french"]

/** Lessons for the "I'm learning" language (none for a language without its own list). */
export function lessonsFor(learning: LearningLanguage): Lesson[] {
  return learning === "spanish" || learning === "french" ? LESSONS_BY_LANGUAGE[learning] : []
}

export function findLesson(id: string | undefined): Lesson | undefined {
  return LESSONS.find((l) => l.id === id)
}

export type InlineSegment = { text: string; style?: "highlight" | "target" }

/** Splits `**highlight**` and `_target-language_` markup into segments. */
export function parseInline(text: string): InlineSegment[] {
  const out: InlineSegment[] = []
  const re = /\*\*(.+?)\*\*|_(.+?)_/g
  let last = 0
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) })
    out.push(m[1] != null ? { text: m[1], style: "highlight" } : { text: m[2], style: "target" })
    last = re.lastIndex
  }
  if (last < text.length) out.push({ text: text.slice(last) })
  return out
}

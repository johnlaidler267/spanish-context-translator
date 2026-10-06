/**
 * What conjugation drills are made of: the verb list and the sentence bank.
 *
 * Sentences carry only verb + tense + person; the expected form is looked up in
 * conjugation.ts, so a typo here can't produce a wrong answer key (conjugation-content.test.ts
 * checks every item resolves).
 */
import type { Person, TenseId } from "@/lib/learn/conjugation"

export type DrillVerb = { verb: string; meaning: string; irregular: boolean }

/** Common verbs, roughly by frequency. `irregular` covers stem changes and spelling changes too. */
export const DRILL_VERBS: DrillVerb[] = [
  { verb: "ser", meaning: "to be", irregular: true },
  { verb: "estar", meaning: "to be (state, location)", irregular: true },
  { verb: "tener", meaning: "to have", irregular: true },
  { verb: "hacer", meaning: "to do, to make", irregular: true },
  { verb: "ir", meaning: "to go", irregular: true },
  { verb: "poder", meaning: "to be able to", irregular: true },
  { verb: "decir", meaning: "to say", irregular: true },
  { verb: "dar", meaning: "to give", irregular: true },
  { verb: "ver", meaning: "to see", irregular: true },
  { verb: "saber", meaning: "to know (a fact)", irregular: true },
  { verb: "querer", meaning: "to want", irregular: true },
  { verb: "llegar", meaning: "to arrive", irregular: true },
  { verb: "pasar", meaning: "to happen, to pass", irregular: false },
  { verb: "deber", meaning: "to owe, to should", irregular: false },
  { verb: "poner", meaning: "to put", irregular: true },
  { verb: "parecer", meaning: "to seem", irregular: true },
  { verb: "quedar", meaning: "to stay, to remain", irregular: false },
  { verb: "creer", meaning: "to believe", irregular: true },
  { verb: "hablar", meaning: "to speak", irregular: false },
  { verb: "llevar", meaning: "to carry, to wear", irregular: false },
  { verb: "dejar", meaning: "to leave, to let", irregular: false },
  { verb: "seguir", meaning: "to follow, to keep on", irregular: true },
  { verb: "encontrar", meaning: "to find", irregular: true },
  { verb: "llamar", meaning: "to call", irregular: false },
  { verb: "venir", meaning: "to come", irregular: true },
  { verb: "pensar", meaning: "to think", irregular: true },
  { verb: "salir", meaning: "to leave, to go out", irregular: true },
  { verb: "volver", meaning: "to return", irregular: true },
  { verb: "tomar", meaning: "to take, to drink", irregular: false },
  { verb: "conocer", meaning: "to know (be familiar with)", irregular: true },
  { verb: "vivir", meaning: "to live", irregular: false },
  { verb: "sentir", meaning: "to feel", irregular: true },
  { verb: "tratar", meaning: "to try, to treat", irregular: false },
  { verb: "mirar", meaning: "to look at", irregular: false },
  { verb: "contar", meaning: "to count, to tell", irregular: true },
  { verb: "empezar", meaning: "to begin", irregular: true },
  { verb: "esperar", meaning: "to wait, to hope", irregular: false },
  { verb: "buscar", meaning: "to look for", irregular: true },
  { verb: "entrar", meaning: "to enter", irregular: false },
  { verb: "trabajar", meaning: "to work", irregular: false },
  { verb: "escribir", meaning: "to write", irregular: true },
  { verb: "perder", meaning: "to lose", irregular: true },
  { verb: "entender", meaning: "to understand", irregular: true },
  { verb: "pedir", meaning: "to ask for", irregular: true },
  { verb: "recibir", meaning: "to receive", irregular: false },
  { verb: "recordar", meaning: "to remember", irregular: true },
  { verb: "dormir", meaning: "to sleep", irregular: true },
  { verb: "traer", meaning: "to bring", irregular: true },
  { verb: "comer", meaning: "to eat", irregular: false },
  { verb: "leer", meaning: "to read", irregular: true },
]

export const DRILL_VERB_MEANING: Record<string, string> = Object.fromEntries(
  DRILL_VERBS.map((v) => [v.verb, v.meaning]),
)

export type DrillSentence = {
  tense: TenseId
  verb: string
  person: Person
  /** "___" marks the blank. */
  text: string
  /** Shown on request after answering: why this tense fits here. */
  why: string
}

export const SENTENCE_BANK: DrillSentence[] = [
  { tense: "present", verb: "vivir", person: 2, text: "Mi hermana ___ en Madrid desde 2019.", why: "An ongoing situation that is still true now. Spanish uses the plain present with desde, where English says “has lived.”" },
  { tense: "present", verb: "saber", person: 1, text: "¿___ hablar alemán?", why: "A present ability. The present of saber + infinitive means “know how to.”" },
  { tense: "present", verb: "salir", person: 0, text: "Todos los días ___ de casa a las siete.", why: "Todos los días marks a habit, and habits take the present." },
  { tense: "preterite", verb: "tener", person: 3, text: "Ayer ___ que salir temprano.", why: "Ayer pins the event to a finished moment, so it takes the preterite." },
  { tense: "preterite", verb: "ir", person: 5, text: "El año pasado mis padres ___ a México.", why: "A single, completed trip in a closed time frame (el año pasado)." },
  { tense: "preterite", verb: "decir", person: 0, text: "Anoche no le ___ nada a nadie.", why: "Anoche is a finished time. The action is seen as complete, not as background." },
  { tense: "imperfect", verb: "vivir", person: 0, text: "Cuando era niño, ___ en el campo.", why: "Background description of how things used to be. No single moment, so imperfect." },
  { tense: "imperfect", verb: "dormir", person: 1, text: "Mientras ___, sonó el teléfono.", why: "The ongoing action (sleeping) is the backdrop; the interruption (sonó) is preterite." },
  { tense: "imperfect", verb: "ir", person: 3, text: "De pequeños, ___ a la playa cada verano.", why: "Cada verano signals a repeated past habit, which takes the imperfect." },
  { tense: "perfect", verb: "trabajar", person: 3, text: "Este año ___ muchísimo.", why: "Este año is a time period that isn't over yet, a classic trigger for the present perfect in Spain." },
  { tense: "perfect", verb: "comer", person: 1, text: "¿Alguna vez ___ paella?", why: "Alguna vez asks about life experience up to now, so present perfect." },
  { tense: "perfect", verb: "escribir", person: 0, text: "Todavía no ___ la carta.", why: "Todavía no connects the past to now. Note the irregular participle: escrito." },
  { tense: "future", verb: "volver", person: 5, text: "El próximo año ___ a Chile.", why: "A plain future event (el próximo año)." },
  { tense: "future", verb: "estar", person: 2, text: "No sé dónde está Marta. ___ en casa, supongo.", why: "Future of probability: Spanish uses the future to guess about the present (“she's probably home”)." },
  { tense: "future", verb: "decir", person: 0, text: "Te lo ___ cuando te vea.", why: "A promise about the future. Decir has an irregular stem: dir-." },
  { tense: "conditional", verb: "hacer", person: 0, text: "En tu lugar, yo no ___ eso.", why: "A hypothetical (“in your place”): what you would do, so conditional." },
  { tense: "conditional", verb: "poder", person: 1, text: "¿___ ayudarme con esto?", why: "The conditional softens a request: “could you…?” is more polite than ¿puedes?" },
  { tense: "conditional", verb: "venir", person: 2, text: "Dijo que ___ a las ocho.", why: "Future seen from the past: after dijo que, the future (vendrá) shifts to the conditional (vendría)." },
  { tense: "subj", verb: "venir", person: 1, text: "Quiero que ___ conmigo.", why: "Querer que + a different subject triggers the subjunctive." },
  { tense: "subj", verb: "hacer", person: 2, text: "Ojalá ___ buen tiempo mañana.", why: "Ojalá expresses a hope, and hopes always take the subjunctive." },
  { tense: "subj", verb: "llegar", person: 5, text: "Es importante que ustedes ___ temprano.", why: "Es importante que is an impersonal judgment, which triggers the subjunctive. Note the spelling change: lleguen." },
  { tense: "subj", verb: "saber", person: 2, text: "No creo que él ___ la verdad.", why: "No creo que expresses doubt, so subjunctive. (Creo que, without no, would take the indicative.)" },
  { tense: "impsubj", verb: "tener", person: 0, text: "Si ___ más tiempo, viajaría más.", why: "Si + imperfect subjunctive + conditional: a hypothetical that isn't true right now." },
  { tense: "impsubj", verb: "volver", person: 0, text: "Mi madre me pidió que ___ temprano.", why: "Pedir que triggers the subjunctive; since pidió is past, it becomes imperfect subjunctive." },
  { tense: "impsubj", verb: "saber", person: 2, text: "Habla como si lo ___ todo.", why: "Como si (“as if”) always takes the imperfect subjunctive." },
  { tense: "impsubj", verb: "estar", person: 5, text: "Ojalá ___ aquí ahora.", why: "Ojalá + imperfect subjunctive wishes for something that isn't the case right now." },
  { tense: "imperative", verb: "venir", person: 1, text: "¡___ aquí ahora mismo!", why: "A direct command to tú. Venir is one of the short irregular tú commands: ven." },
  { tense: "imperative", verb: "hablar", person: 2, text: "Señora, ___ más despacio, por favor.", why: "Señora calls for usted, and usted commands borrow the present subjunctive: hable." },
  { tense: "imperative", verb: "poner", person: 1, text: "___ la mesa, que ya vamos a comer.", why: "A tú command. Poner's tú command drops to the bare stem: pon." },
  { tense: "imperative", verb: "salir", person: 5, text: "Niños, ___ al jardín a jugar.", why: "Speaking to a group (in Latin America, always ustedes): the command is the subjunctive form, salgan." },
  { tense: "imperative", verb: "empezar", person: 3, text: "Bueno, ___ por el principio.", why: "A nosotros command means “let's…”, and it uses the subjunctive form. Note the spelling change: empecemos." },
  { tense: "imperative", verb: "decir", person: 1, text: "___ la verdad, por favor.", why: "A tú command. Decir is irregular here: di." },
]

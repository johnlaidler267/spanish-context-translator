/**
 * Static chunk lookup — reverse conjugation table + particle supplement.
 *
 * The reading UI (`useChunkDetails`) uses the LLM only; this module is kept for
 * experiments or future reuse. `lookupChunk()` is not called from the app shell.
 */

import { Conjugator, type Result } from "@jirimracek/conjugate-esp"

// ─── Types ───────────────────────────────────────────────────────────────────

export interface VerbFormInfo {
  infinitive: string
  tense: string      // human-readable: "present indicative"
  mood: string       // "indicativo" | "subjuntivo" | "imperativo" | "impersonal"
  person: string     // "3rd singular (él/ella/Ud.)" | "non-finite"
}

export type DetailKind = "verb" | "particle" | "phrase"

export interface StaticDetail {
  kind: DetailKind
  forms?: VerbFormInfo[]      // verb lookup: one or more matching verb forms
  note?: string               // particle / phrase note
}

// ─── Normalization ────────────────────────────────────────────────────────────

/**
 * Lowercase + strip punctuation, but PRESERVE accents so that
 * "habló" (preterite) and "hablo" (present) stay distinct.
 */
export function normalizeChunk(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[¿¡.,;:!?¡()\[\]«»""'''"\-]/g, "")
    .trim()
}

// ─── Particle / function-word supplement ─────────────────────────────────────

const PARTICLE_NOTES: Record<string, { note: string; kind: DetailKind }> = {
  // Prepositions
  "de":       { kind: "particle", note: "of / from / about — Spanish's most versatile preposition, covering origin, composition, topic, and more." },
  "en":       { kind: "particle", note: "in / on / at — marks location, time, or state." },
  "a":        { kind: "particle", note: "to / at — marks direction or destination; also required before direct-object people (\"personal a\"): *Vi a Juan*." },
  "por":      { kind: "particle", note: "by / for / because of / through / per — expresses cause, agent, exchange, duration, or motion along a path." },
  "para":     { kind: "particle", note: "for / in order to / toward / by (deadline) — expresses purpose, recipient, destination, or a future point in time." },
  "con":      { kind: "particle", note: "with — marks accompaniment or instrument." },
  "sin":      { kind: "particle", note: "without." },
  "sobre":    { kind: "particle", note: "on / about / above / around (approximately)." },
  "entre":    { kind: "particle", note: "between / among." },
  "hasta":    { kind: "particle", note: "until / up to / as far as / even (surprisingly)." },
  "desde":    { kind: "particle", note: "from / since — marks a starting point in space or time." },
  "durante":  { kind: "particle", note: "during / for (a period of time)." },
  "ante":     { kind: "particle", note: "before / in front of / faced with (formal/literary)." },
  "bajo":     { kind: "particle", note: "under / below / beneath." },
  "tras":     { kind: "particle", note: "after / behind / following (formal/literary)." },
  "según":    { kind: "particle", note: "according to / depending on." },
  "hacia":    { kind: "particle", note: "toward / around (approximate time)." },
  "mediante": { kind: "particle", note: "by means of / through (formal)." },

  // Conjunctions
  "que":      { kind: "particle", note: "that / which / who / than — the single most frequent Spanish word; links clauses, introduces relative clauses, or compares." },
  "y":        { kind: "particle", note: "and (becomes *e* before words starting with i-/hi-)." },
  "o":        { kind: "particle", note: "or (becomes *u* before words starting with o-/ho-)." },
  "pero":     { kind: "particle", note: "but — introduces a contrasting clause while allowing the first clause to stand." },
  "sino":     { kind: "particle", note: "but rather / instead — used only after a negation: *no X sino Y*." },
  "ni":       { kind: "particle", note: "nor / neither — used to chain negative elements." },
  "porque":   { kind: "particle", note: "because — gives a reason (written as one word)." },
  "aunque":   { kind: "particle", note: "although / even though / even if — the subjunctive vs. indicative after it shifts the meaning (fact vs. hypothesis)." },
  "cuando":   { kind: "particle", note: "when — triggers subjunctive for future or hypothetical events." },
  "donde":    { kind: "particle", note: "where." },
  "como":     { kind: "particle", note: "like / as / how / since — context determines whether it means manner, comparison, or cause." },
  "si":       { kind: "particle", note: "if / whether — conditional sentences; never takes an accent (unlike *sí* = yes)." },
  "pues":     { kind: "particle", note: "well / then / since / because — discourse marker whose meaning depends heavily on tone and position." },
  "entonces": { kind: "particle", note: "then / so / therefore." },
  "así":      { kind: "particle", note: "like this / so / thus / in this way." },
  "mientras": { kind: "particle", note: "while / as long as / whereas." },
  "apenas":   { kind: "particle", note: "hardly / barely / as soon as (when followed by a verb)." },

  // Relative / interrogative pronouns & adverbs
  "cual":     { kind: "particle", note: "which / who — used after a preposition (*el cual*, *la cual*)." },
  "cuyo":     { kind: "particle", note: "whose — agrees in gender and number with the noun it modifies." },
  "qué":      { kind: "particle", note: "what / which (question or exclamation) — always accented in direct or indirect questions." },
  "quién":    { kind: "particle", note: "who (person, question/relative) — always accented in questions." },
  "cuándo":   { kind: "particle", note: "when (question) — accented in direct/indirect questions." },
  "dónde":    { kind: "particle", note: "where (question) — accented in direct/indirect questions." },
  "cómo":     { kind: "particle", note: "how (question or exclamation) — accented in questions." },
  "cuánto":   { kind: "particle", note: "how much / how many (question) — agrees in number/gender with the noun." },

  // Pronouns / clitics
  "lo":       { kind: "particle", note: "it / him (direct object, masculine or neuter) — as a neuter article: *lo importante* = 'the important thing'." },
  "la":       { kind: "particle", note: "her / it (direct object, feminine) — also the feminine definite article." },
  "le":       { kind: "particle", note: "to him / to her / to you (indirect object, singular) — note: *le* is used even when *lo/la* is the direct object (*se lo di*)." },
  "les":      { kind: "particle", note: "to them / to you all (indirect object, plural) — becomes *se* before *lo/la/los/las*." },
  "se":       { kind: "particle", note: "reflexive / passive / impersonal marker — can signal the subject acting on itself, passive voice (*se vende*), or an impersonal statement (*se dice que…*)." },
  "me":       { kind: "particle", note: "me (direct/indirect object, 1st singular) — also reflexive: *me levanto* = I get myself up." },
  "te":       { kind: "particle", note: "you (direct/indirect object, 2nd singular informal) — also reflexive." },
  "nos":      { kind: "particle", note: "us (direct/indirect object, 1st plural) — also reflexive." },
  "os":       { kind: "particle", note: "you all (direct/indirect object, 2nd plural, Spain) — also reflexive." },

  // Adverbs
  "ya":       { kind: "particle", note: "already / now / soon / anymore — meaning shifts with tense and context; in *ya no* = no longer." },
  "todavía":  { kind: "particle", note: "still / yet — *todavía no* = not yet." },
  "aún":      { kind: "particle", note: "still / yet / even — with accent means 'still'; without (*aun*) means 'even'." },
  "muy":      { kind: "particle", note: "very — always precedes the adjective or adverb it intensifies." },
  "más":      { kind: "particle", note: "more / most / else / anymore — *más de* + number vs. *más que* + clause." },
  "menos":    { kind: "particle", note: "less / fewer / minus / except." },
  "también":  { kind: "particle", note: "also / too / as well." },
  "tampoco":  { kind: "particle", note: "neither / not either — negative counterpart of *también*." },
  "solo":     { kind: "particle", note: "only / alone / just — *sólo* (with accent) is an older spelling for the adverb meaning 'only'." },
  "mismo":    { kind: "particle", note: "same / -self / even (intensifier) — *el mismo*, *yo mismo*, *ahora mismo* (right now)." },
  "tan":      { kind: "particle", note: "so / as (before adj/adv) — part of *tan… como* = as… as." },
  "tanto":    { kind: "particle", note: "so much / as much — part of *tanto… como* (as much… as) or *tanto* as standalone adverb." },
  "acaso":    { kind: "particle", note: "perhaps / in case / by any chance — often introduces a rhetorical question." },
  "quizás":   { kind: "particle", note: "perhaps / maybe — triggers subjunctive when uncertainty is emphasized." },
  "nunca":    { kind: "particle", note: "never / ever (in questions) — double negation with *no* is standard in Spanish: *no lo vi nunca*." },
  "siempre":  { kind: "particle", note: "always / still (in *siempre que* = as long as / every time)." },
  "jamás":    { kind: "particle", note: "never (stronger than *nunca*) — *nunca jamás* = never ever." },
  "aquí":     { kind: "particle", note: "here (specific location near speaker)." },
  "allí":     { kind: "particle", note: "there (at a specific location away from speaker and listener)." },
  "ahí":      { kind: "particle", note: "there (near the listener, or a previously mentioned location)." },

  // Determiners / quantifiers
  "todo":     { kind: "particle", note: "all / every / whole / everything — agrees in gender/number with the noun." },
  "cada":     { kind: "particle", note: "each / every — invariable (no gender agreement)." },
  "algún":    { kind: "particle", note: "some / any — shortened form of *alguno* before a masculine singular noun." },
  "ningún":   { kind: "particle", note: "no / none / any — shortened form of *ninguno*; often triggers double negation." },
  "cierto":   { kind: "particle", note: "a certain / sure / definite — before noun = a certain X; after noun/verb = certain, true." },

  // Common impersonal haber forms
  "hay":      { kind: "phrase", note: "there is / there are — impersonal present of *haber*; does not agree in number (*hay dos casas*)." },
  "había":    { kind: "phrase", note: "there was / there were — impersonal imperfect of *haber*." },
  "hubo":     { kind: "phrase", note: "there was / there were — impersonal preterite of *haber*; used for completed, event-like existence." },
  "habrá":    { kind: "phrase", note: "there will be — impersonal future of *haber*." },
  "habría":   { kind: "phrase", note: "there would be — impersonal conditional of *haber*." },
  "haya":     { kind: "phrase", note: "there may be / there is (subjunctive) — impersonal present subjunctive of *haber*." },
  "hubiera":  { kind: "phrase", note: "there were / there had been (subjunctive) — impersonal imperfect subjunctive of *haber*." },
}

// ─── Person labels ────────────────────────────────────────────────────────────

const PERSON_LABELS = [
  "1st singular (yo)",
  "2nd singular (tú)",
  "3rd singular (él/ella/Ud.)",
  "1st plural (nosotros)",
  "2nd plural (vosotros)",
  "3rd plural (ellos/Uds.)",
]

// ─── Common verbs to index ────────────────────────────────────────────────────

const COMMON_VERBS: string[] = [
  // Core irregular / high-frequency
  "ser", "estar", "ir", "haber", "tener", "hacer", "poder", "querer", "decir",
  "saber", "ver", "dar", "venir", "poner", "traer", "caer", "oír", "salir",
  "valer", "caber", "conducir", "producir", "traducir",
  // Motion / location
  "llegar", "llegar", "partir", "entrar", "subir", "bajar", "volver", "regresar",
  "avanzar", "seguir", "pasar", "cruzar", "correr", "caminar", "andar",
  // Communication / cognition
  "hablar", "llamar", "preguntar", "responder", "contar", "explicar", "mostrar",
  "describir", "indicar", "señalar", "afirmar", "negar", "reconocer",
  "pensar", "creer", "imaginar", "recordar", "olvidar", "saber", "conocer",
  "entender", "comprender", "aprender", "estudiar",
  // Existence / state
  "existir", "parecer", "resultar", "quedar", "quedar", "permanecer", "continuar",
  "durar", "ocurrir", "suceder", "pasar", "producir",
  // Action
  "tomar", "llevar", "dejar", "poner", "sacar", "abrir", "cerrar",
  "romper", "perder", "ganar", "buscar", "encontrar", "conseguir",
  "obtener", "lograr", "alcanzar", "realizar", "cumplir", "acabar",
  "comenzar", "empezar", "terminar", "acabar", "continuar",
  "usar", "utilizar", "aplicar", "cambiar", "convertir", "crear",
  "escribir", "leer", "escuchar", "recibir", "enviar", "pagar",
  "comprar", "vender", "trabajar", "vivir", "morir", "nacer",
  "dormir", "despertar", "comer", "beber", "reír", "llorar",
  "amar", "querer", "odiar", "sentir", "sufrir", "gozar",
  "jugar", "ganar", "perder",
  // Reflexive / change-of-state
  "ponerse", "hacerse", "volverse", "quedarse", "irse",
  "levantarse", "sentarse", "llamarse",
]

// ─── Reverse map builder ──────────────────────────────────────────────────────

function addEntry(
  map: Map<string, VerbFormInfo[]>,
  rawForm: string,
  info: VerbFormInfo,
) {
  const key = normalizeChunk(rawForm)
  if (!key || key.length < 2) return
  let arr = map.get(key)
  if (!arr) { arr = []; map.set(key, arr) }
  // Deduplicate
  if (!arr.some(e => e.infinitive === info.infinitive && e.tense === info.tense && e.person === info.person)) {
    arr.push(info)
  }
}

let _reverseMap: Map<string, VerbFormInfo[]> | null = null

function getReverseMap(): Map<string, VerbFormInfo[]> {
  if (_reverseMap) return _reverseMap

  const map = new Map<string, VerbFormInfo[]>()
  const conj = new Conjugator()

  // Deduplicate verb list
  const verbs = [...new Set(COMMON_VERBS)]

  for (const verb of verbs) {
    let results: Result[] | string
    try {
      results = conj.conjugateSync(verb) as Result[] | string
    } catch {
      continue
    }
    if (typeof results === "string" || !Array.isArray(results)) continue

    for (const result of results) {
      const t = result.conjugation

      // Impersonal
      if (t.Impersonal?.Gerundio) {
        addEntry(map, t.Impersonal.Gerundio, {
          infinitive: verb, tense: "gerund (-ndo form)", mood: "impersonal", person: "non-finite",
        })
      }
      if (t.Impersonal?.Participio) {
        addEntry(map, t.Impersonal.Participio, {
          infinitive: verb, tense: "past participle", mood: "impersonal", person: "non-finite",
        })
      }

      // Simple indicativo
      const indicTenses: [keyof typeof t.Indicativo, string][] = [
        ["Presente",            "present indicative"],
        ["PreteritoImperfecto", "imperfect indicative"],
        ["PreteritoIndefinido", "preterite (simple past)"],
        ["FuturoImperfecto",    "future indicative"],
        ["CondicionalSimple",   "conditional"],
      ]
      for (const [key, label] of indicTenses) {
        const forms = t.Indicativo?.[key] as string[] | undefined
        if (!forms) continue
        forms.forEach((form, i) => {
          if (!form) return
          addEntry(map, form, {
            infinitive: verb, tense: label, mood: "indicativo", person: PERSON_LABELS[i] ?? `person ${i + 1}`,
          })
        })
      }

      // Simple subjuntivo
      const subjTenses: [keyof typeof t.Subjuntivo, string][] = [
        ["Presente",               "present subjunctive"],
        ["PreteritoImperfectoRa",  "imperfect subjunctive (-ra)"],
        ["PreteritoImperfectoSe",  "imperfect subjunctive (-se)"],
      ]
      for (const [key, label] of subjTenses) {
        const forms = t.Subjuntivo?.[key] as string[] | undefined
        if (!forms) continue
        forms.forEach((form, i) => {
          if (!form) return
          addEntry(map, form, {
            infinitive: verb, tense: label, mood: "subjuntivo", person: PERSON_LABELS[i] ?? `person ${i + 1}`,
          })
        })
      }

      // Imperativo
      const impForms = t.Imperativo?.Afirmativo as string[] | undefined
      if (impForms) {
        impForms.forEach((form, i) => {
          if (!form) return
          addEntry(map, form, {
            infinitive: verb, tense: "imperative (affirmative)", mood: "imperativo", person: PERSON_LABELS[i] ?? `person ${i + 1}`,
          })
        })
      }
    }
  }

  _reverseMap = map
  return map
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function lookupChunk(text: string): StaticDetail | null {
  const key = normalizeChunk(text)
  if (!key) return null

  // 1. Particle / function-word supplement (no conjugator needed)
  const p = PARTICLE_NOTES[key]
  if (p) return { kind: p.kind, note: p.note }

  // 2. Verb reverse-lookup (builds lazily on first call)
  const map = getReverseMap()
  const forms = map.get(key)
  if (forms && forms.length > 0) return { kind: "verb", forms }

  return null
}

-- =============================================================================
-- Migration: 0031_discover_beginner_originals
-- Description: Seeds short, original beginner stories (Spanish, French, English)
--   into the Discover catalog.
--
-- Why: most of the catalog is copyrighted text kept private (see 0030), so a
-- public visitor had almost nothing beginner-level to read. These stories were
-- written for LexaLens, so they are free to show anyone: present tense,
-- high-frequency vocabulary, short sentences, ~350-450 words each.
--
-- cover_image is blank on purpose: Discover draws its typographic plate cover
-- (discover-cover-art.tsx) instead of depending on a third-party image URL.
-- Fixed ids + "on conflict do nothing" make re-running this a no-op, and a
-- curator's later edits to these rows are never overwritten.
-- =============================================================================

insert into public.discover_items (
  id, title, author, type, difficulty, word_count, language, cover_image, tags, preview, estimated_time, body_text, is_private
) values
(
  'b0000001-0000-4000-8000-000000000001',
  'El gato de la señora Rosa',
  'LexaLens Originals',
  'book',
  'beginner',
  401,
  'Spanish',
  '',
  array['Short Story', 'Everyday Life', 'Animals']::text[],
  $t1$La señora Rosa vive en una casa pequeña y azul, al final de la calle. Tiene setenta años, un jardín lleno de flores y un gato gris que se llama Pimienta.

Todas las mañanas, Pimienta duerme al sol en la ventana. Todas las tardes, come pescado en la cocina. Y todas las noches, duerme en la cama de la señora Rosa.

Pero un lunes por la mañana, la ventana está vacía. Pimienta no está.

—¡Pimienta! ¡Pimienta! —llama la señora Rosa en el jardín.

No hay respuesta.

Mateo, un niño de diez años, vive en la casa de al lado. Ve a la señora Rosa en el jardín y sale de su casa.

—Buenos días, señora Rosa. ¿Qué pasa?

—Mi gato no está —dice ella—. Siempre está en la ventana por la mañana. Estoy muy preocupada.

—No se preocupe —dice Mateo—. Yo la ayudo. Vamos a buscarlo juntos.

Primero, buscan en el $t1$,
  '3 min',
  $t1$La señora Rosa vive en una casa pequeña y azul, al final de la calle. Tiene setenta años, un jardín lleno de flores y un gato gris que se llama Pimienta.

Todas las mañanas, Pimienta duerme al sol en la ventana. Todas las tardes, come pescado en la cocina. Y todas las noches, duerme en la cama de la señora Rosa.

Pero un lunes por la mañana, la ventana está vacía. Pimienta no está.

—¡Pimienta! ¡Pimienta! —llama la señora Rosa en el jardín.

No hay respuesta.

Mateo, un niño de diez años, vive en la casa de al lado. Ve a la señora Rosa en el jardín y sale de su casa.

—Buenos días, señora Rosa. ¿Qué pasa?

—Mi gato no está —dice ella—. Siempre está en la ventana por la mañana. Estoy muy preocupada.

—No se preocupe —dice Mateo—. Yo la ayudo. Vamos a buscarlo juntos.

Primero, buscan en el jardín. Miran debajo de los árboles y detrás de las flores. Nada.

Después, caminan por la calle. Preguntan al señor del quiosco.

—¿Usted ve un gato gris, por favor?

—Hoy no —dice el señor—. Lo siento.

Preguntan a una mujer con un perro grande. Ella tampoco ve al gato.

Mateo piensa un momento.

—Señora Rosa, ¿qué le gusta mucho a Pimienta?

—Le gusta el sol, le gusta dormir… y le gusta mucho el pescado.

—¡El pescado! —dice Mateo—. ¡Vamos al mercado!

El mercado está en la plaza, a cinco minutos. Hay frutas, verduras, pan y, al fondo, la tienda de pescado de don Julio.

Cuando llegan, don Julio sonríe.

—¿Buscan a alguien? —pregunta.

Detrás del mostrador, en una caja de madera, hay un gato gris. Está muy tranquilo y muy contento.

—¡Pimienta! —grita la señora Rosa.

—Llega todos los lunes —dice don Julio—. Le doy un poco de pescado y después duerme aquí toda la mañana. Pensaba que era un gato de la calle.

La señora Rosa ríe.

—Ahora entiendo. ¡Los lunes no come en casa!

La señora Rosa compra pescado para la cena. Mateo lleva a Pimienta en los brazos y los tres vuelven a la casa azul.

Esa tarde, la señora Rosa hace una tarta de manzana para Mateo.

—Gracias por tu ayuda —le dice.

—De nada —dice Mateo—. Pero tengo una pregunta: ¿puedo venir el próximo lunes? Quiero ir al mercado con Pimienta.

La señora Rosa sonríe. En la ventana, al sol, Pimienta ya duerme otra vez.$t1$,
  false
),
(
  'b0000001-0000-4000-8000-000000000002',
  'La tortilla de la abuela',
  'LexaLens Originals',
  'book',
  'beginner',
  390,
  'Spanish',
  '',
  array['Short Story', 'Food', 'Family']::text[],
  $t2$Lucía tiene veinticinco años y vive en Madrid. Trabaja en una oficina, de lunes a viernes. Le gusta su trabajo, pero no le gusta mucho cocinar. Normalmente come un sándwich o una ensalada.

Pero este sábado es especial. Es el cumpleaños de su abuela, y Lucía quiere preparar una cena para toda la familia.

—Abuela, ¿cuál es tu comida favorita? —le pregunta por teléfono.

—La tortilla de patatas, hija. Como la tortilla de tu abuelo.

Lucía no sabe hacer tortilla de patatas. Busca una receta en internet. Necesita patatas, huevos, una cebolla, aceite de oliva y sal. "Es fácil", piensa.

El sábado por la mañana, Lucía va al supermercado. Compra seis patatas, una docena de huevos, una cebolla grande y una botella de aceite. También compra pan, queso y una tarta de chocolate.

En casa, Lucía empi$t2$,
  '2 min',
  $t2$Lucía tiene veinticinco años y vive en Madrid. Trabaja en una oficina, de lunes a viernes. Le gusta su trabajo, pero no le gusta mucho cocinar. Normalmente come un sándwich o una ensalada.

Pero este sábado es especial. Es el cumpleaños de su abuela, y Lucía quiere preparar una cena para toda la familia.

—Abuela, ¿cuál es tu comida favorita? —le pregunta por teléfono.

—La tortilla de patatas, hija. Como la tortilla de tu abuelo.

Lucía no sabe hacer tortilla de patatas. Busca una receta en internet. Necesita patatas, huevos, una cebolla, aceite de oliva y sal. "Es fácil", piensa.

El sábado por la mañana, Lucía va al supermercado. Compra seis patatas, una docena de huevos, una cebolla grande y una botella de aceite. También compra pan, queso y una tarta de chocolate.

En casa, Lucía empieza a cocinar. Corta las patatas y la cebolla. Pone mucho aceite en la sartén. Fríe las patatas despacio. La cocina huele muy bien.

Después, bate los huevos en un bol y añade las patatas y la sal. Todo va bien.

Ahora viene la parte difícil: dar la vuelta a la tortilla. Lucía pone un plato encima de la sartén, respira y… ¡zas! La tortilla cae al suelo.

—¡No! —dice Lucía.

Son las seis de la tarde. La familia llega a las ocho. Lucía está triste, pero no tiene tiempo para llorar. Vuelve al supermercado, compra más patatas y más huevos, y empieza otra vez.

Esta vez, cocina más despacio. Cuando llega el momento, pone el plato, respira otra vez y da la vuelta a la tortilla. ¡Perfecto! No es muy bonita, pero está entera.

A las ocho, llega la familia: sus padres, su hermano Pablo y, claro, la abuela. Todos se sientan a la mesa.

La abuela prueba la tortilla. Cierra los ojos. Todos esperan.

—Mmm… —dice—. Está un poco salada.

Lucía se pone roja.

—Pero —continúa la abuela— la tortilla de tu abuelo también estaba un poco salada. Y era la mejor tortilla del mundo.

Todos ríen. Pablo come tres trozos. Su padre pide la receta.

Después de la cena, comen la tarta de chocolate y cantan "Cumpleaños feliz". La abuela abraza a Lucía.

—Es el mejor regalo —le dice—. ¿Sabes por qué? Porque lo hiciste tú.

Esa noche, Lucía lava los platos y sonríe. Quizás, piensa, cocinar no es tan terrible.$t2$,
  false
),
(
  'b0000001-0000-4000-8000-000000000003',
  'Le parapluie rouge',
  'LexaLens Originals',
  'book',
  'beginner',
  411,
  'French',
  '',
  array['Short Story', 'Paris', 'Kindness']::text[],
  $t3$Il pleut à Paris. Léa est dans le métro, sur la ligne 4. Elle a vingt-deux ans, elle est étudiante et elle va à l'université.

Dans le métro, il y a beaucoup de monde. À côté de Léa, un vieux monsieur lit un journal. Il porte un chapeau noir et il a un grand parapluie rouge.

À la station Saint-Michel, le monsieur se lève très vite et sort du métro. Les portes se ferment. Léa regarde le siège. Le parapluie rouge est toujours là !

— Monsieur ! Votre parapluie ! dit Léa.

Mais c'est trop tard. Le métro part.

Léa prend le parapluie. Il est vieux mais très beau. Sur la poignée, il y a une petite étiquette : « Henri Martin, 12 rue des Lilas ».

Léa réfléchit. Elle a un cours à neuf heures. Mais il pleut beaucoup, et le monsieur n'a pas de parapluie maintenant.

À la station suivante, elle sor$t3$,
  '3 min',
  $t3$Il pleut à Paris. Léa est dans le métro, sur la ligne 4. Elle a vingt-deux ans, elle est étudiante et elle va à l'université.

Dans le métro, il y a beaucoup de monde. À côté de Léa, un vieux monsieur lit un journal. Il porte un chapeau noir et il a un grand parapluie rouge.

À la station Saint-Michel, le monsieur se lève très vite et sort du métro. Les portes se ferment. Léa regarde le siège. Le parapluie rouge est toujours là !

— Monsieur ! Votre parapluie ! dit Léa.

Mais c'est trop tard. Le métro part.

Léa prend le parapluie. Il est vieux mais très beau. Sur la poignée, il y a une petite étiquette : « Henri Martin, 12 rue des Lilas ».

Léa réfléchit. Elle a un cours à neuf heures. Mais il pleut beaucoup, et le monsieur n'a pas de parapluie maintenant.

À la station suivante, elle sort et cherche la rue des Lilas sur son téléphone. Ce n'est pas loin : dix minutes à pied.

Elle marche sous la pluie avec le parapluie rouge. Les rues sont grises, mais le parapluie est comme une petite lumière.

Au 12 rue des Lilas, il y a une vieille porte bleue. Léa sonne. Une femme âgée ouvre la porte.

— Bonjour, madame. Je cherche Henri Martin. J'ai son parapluie.

La femme regarde le parapluie et met la main sur son cœur.

— Oh ! Le parapluie ! Entrez, entrez, mademoiselle.

Dans la cuisine, la femme fait du thé.

— Je m'appelle Hélène. Henri, c'est mon mari. Ce parapluie, c'est un cadeau. Je lui ai donné ce parapluie il y a cinquante ans, le jour de notre mariage. Il pleuvait ce jour-là aussi.

À ce moment, la porte s'ouvre. Le vieux monsieur entre. Il est mouillé et il a l'air triste.

— Hélène, j'ai une mauvaise nouvelle… commence-t-il.

Puis il voit Léa et le parapluie sur la table. Il sourit comme un enfant.

— Mais comment… ?

Léa explique tout : le métro, l'étiquette, la rue des Lilas.

— Merci, mademoiselle, dit Henri. Vous êtes très gentille.

Léa arrive à l'université à onze heures. Elle est en retard pour son cours, mais elle n'est pas triste.

Le samedi suivant, elle reçoit une carte. Dedans, il y a un petit dessin : un parapluie rouge et deux personnes âgées. Et ces mots : « Venez dîner chez nous dimanche. Il va pleuvoir, mais nous avons un parapluie. »$t3$,
  false
),
(
  'b0000001-0000-4000-8000-000000000004',
  'Le croissant de Hugo',
  'LexaLens Originals',
  'book',
  'beginner',
  382,
  'French',
  '',
  array['Short Story', 'Food', 'Work']::text[],
  $t4$Hugo a seize ans. C'est l'été, et il n'y a pas d'école. Hugo veut gagner un peu d'argent, alors il trouve un petit travail : il travaille à la boulangerie de Madame Dubois, dans son village.

Le premier jour, Hugo se réveille à cinq heures du matin. Il fait encore nuit. Il prend son vélo et va à la boulangerie.

Madame Dubois est déjà là. Elle porte un tablier blanc et elle a de la farine sur les mains.

— Bonjour, Hugo ! Tu es à l'heure. C'est bien. Aujourd'hui, tu vas m'aider avec les croissants.

Dans la cuisine, il fait chaud. Ça sent le beurre et le pain. Madame Dubois montre à Hugo comment rouler la pâte.

— Doucement, dit-elle. Le croissant, c'est comme une personne. Il faut être patient avec lui.

Hugo essaie. Son premier croissant est très petit. Le deuxième est très gros. Le troi$t4$,
  '2 min',
  $t4$Hugo a seize ans. C'est l'été, et il n'y a pas d'école. Hugo veut gagner un peu d'argent, alors il trouve un petit travail : il travaille à la boulangerie de Madame Dubois, dans son village.

Le premier jour, Hugo se réveille à cinq heures du matin. Il fait encore nuit. Il prend son vélo et va à la boulangerie.

Madame Dubois est déjà là. Elle porte un tablier blanc et elle a de la farine sur les mains.

— Bonjour, Hugo ! Tu es à l'heure. C'est bien. Aujourd'hui, tu vas m'aider avec les croissants.

Dans la cuisine, il fait chaud. Ça sent le beurre et le pain. Madame Dubois montre à Hugo comment rouler la pâte.

— Doucement, dit-elle. Le croissant, c'est comme une personne. Il faut être patient avec lui.

Hugo essaie. Son premier croissant est très petit. Le deuxième est très gros. Le troisième ressemble à un serpent.

— Ce n'est pas grave, dit Madame Dubois en riant. Moi, à seize ans, mes croissants étaient horribles.

À sept heures, la boulangerie ouvre. Les premiers clients arrivent.

— Bonjour ! Une baguette, s'il vous plaît, dit un homme en costume.

— Deux croissants et un pain au chocolat, dit une petite fille avec sa mère.

Hugo prend l'argent et rend la monnaie. Il fait une erreur, puis une autre. Il est un peu stressé. Mais les clients sont gentils.

À dix heures, un vieux monsieur entre. Il marche lentement avec une canne.

— Bonjour, Marcel ! dit Madame Dubois. Comme d'habitude ?

— Comme d'habitude, répond Marcel.

Madame Dubois donne à Marcel une petite baguette et un croissant. Marcel paie et regarde le croissant.

— Ce croissant est un peu… bizarre, dit-il.

Hugo devient tout rouge. C'est le croissant serpent !

— C'est le premier croissant de Hugo, explique Madame Dubois. Notre nouvel apprenti.

Marcel goûte le croissant. Il réfléchit longtemps.

— Pas mal, jeune homme. Pas mal du tout. Il est bizarre, mais il est bon.

À midi, Hugo rentre chez lui. Il est très fatigué, mais il est content. Dans son sac, il a un croissant parfait. C'est le dixième croissant de la journée, et c'est le sien.

Le lendemain, à dix heures, Marcel revient.

— Bonjour, dit-il. Un croissant, s'il vous plaît. Un croissant de Hugo.$t4$,
  false
),
(
  'b0000001-0000-4000-8000-000000000005',
  'The Lost Key',
  'LexaLens Originals',
  'book',
  'beginner',
  432,
  'English',
  '',
  array['Short Story', 'Everyday Life', 'Friendship']::text[],
  $t5$Sam lives on the third floor of an old building in a big city. He is thirty years old and he works at a bookstore. Every morning, he takes the bus to work at eight o'clock.

One Monday, Sam is late. He drinks his coffee fast, puts on his jacket, and runs out of the apartment. The door closes behind him. Click.

Then he stops. He puts his hand in his pocket. No keys.

He looks in his other pocket. He looks in his bag. Nothing. His keys are on the kitchen table, inside the apartment.

"Oh no," says Sam.

He knocks on the door of his neighbor, Mrs. Patel. She has an extra key for emergencies. But nobody answers. Then he remembers: Mrs. Patel is visiting her daughter this week.

Sam calls the building manager. "I'm sorry," says the manager. "I'm on vacation. I can come back on Friday."

Friday$t5$,
  '3 min',
  $t5$Sam lives on the third floor of an old building in a big city. He is thirty years old and he works at a bookstore. Every morning, he takes the bus to work at eight o'clock.

One Monday, Sam is late. He drinks his coffee fast, puts on his jacket, and runs out of the apartment. The door closes behind him. Click.

Then he stops. He puts his hand in his pocket. No keys.

He looks in his other pocket. He looks in his bag. Nothing. His keys are on the kitchen table, inside the apartment.

"Oh no," says Sam.

He knocks on the door of his neighbor, Mrs. Patel. She has an extra key for emergencies. But nobody answers. Then he remembers: Mrs. Patel is visiting her daughter this week.

Sam calls the building manager. "I'm sorry," says the manager. "I'm on vacation. I can come back on Friday."

Friday! Today is Monday.

Sam sits on the stairs. He is hungry, he is late, and he is a little angry with himself.

A door opens on the second floor. A young woman comes up the stairs with a small dog. Sam doesn't know her. She is new in the building.

"Hi," she says. "Are you okay?"

"Not really," says Sam. "My keys are inside, and I'm outside."

The woman laughs, but in a nice way. "I know that feeling. I'm Nora. I moved in last week."

"I'm Sam."

Nora thinks for a moment. "Is your kitchen window open?"

"Yes, a little. But I'm on the third floor."

"Come with me," says Nora.

Her apartment is right under Sam's. From her small balcony, they can see his kitchen window. It is open. And there is a ladder in the garden behind the building.

Nora holds the ladder. Sam climbs up, very slowly. His heart is beating fast. He opens the window and climbs into his kitchen. His keys are there on the table, next to his empty coffee cup.

"I'm in!" he shouts.

"Great!" Nora shouts back. Her dog barks.

Sam is very late for work now, but his boss understands. That evening, Sam buys a cake and knocks on Nora's door.

"This is for you," he says. "Thank you for this morning."

"You're welcome," says Nora. "Do you want to come in? I can make tea."

They talk for two hours. Before Sam leaves, Nora gives him a small piece of paper.

"What's this?" he asks.

"My phone number," she says. "For the next time you lose your keys."

Sam smiles. For the first time, he is happy he forgot something.$t5$,
  false
)
on conflict (id) do nothing;

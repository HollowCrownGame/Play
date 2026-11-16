// THE HOLLOW CROWN - all written content: notes, NPC dialogue, objectives, endings.
window.HC = window.HC || {};

HC.NOTES = {
  // ---------------- Prologue: the Drowned Village
  letter: { title: 'An Unsigned Letter', text: `<p>Traveler,</p><p>You will not remember asking for this letter. Come anyway.</p>
    <p>Follow the old road north into Veyr, where the sun has not risen in three hundred years. Rest at the ember in the square. Do not answer the bell.</p>
    <p><i>The King is still beneath the castle. He has been waiting for you.</i></p>` },
  ledger: { title: 'Ledger of the Reeve', text: `<p>Year 1 of the Eclipse - 212 souls counted.<br>Year 40 - 160 souls.<br>Year 112 - 61 souls.<br>Year 290 - 9 souls.</p>
    <p>None buried. None fled. The crown's men came each winter with a list, and the ones on the list went <i>below</i>.</p>
    <p>We hated him for it. We hated him so much that we never asked what they were sent below <b>for</b>.</p>` },
  drawing: { title: "A Child's Drawing", text: `<p>A crayon drawing of the church. The bell is coloured in black. Beneath the church, scribbled hard enough to tear the paper, is a second, much larger church, upside down.</p>
    <p>On the back: <i>"Mama says the bell rings for the ones who went down. It rang for papa. It rings for me tonight but I'm not scared, papa says it's warm down there."</i></p>` },
  church: { title: 'Notice Nailed to the Church Door', text: `<p><b>SANCTUARY CLOSED BY ORDER OF THE CROWN.</b></p><p>DO NOT OPEN.<br>DO NOT ANSWER.<br>DO NOT RING.</p>
    <p>Beneath it, scratched into the wood with a fingernail: <i>"there is no rope. who is ringing it"</i></p>
    <p>The door is barred from the inside. Something on the other side knocks back, exactly as many times as you do.</p>` },
  keeper: { title: "Groundskeeper's Note", text: `<p>Every night something knocks on the crypt door from below, and every night it uses my brother's voice. My brother has been dead nineteen years. I buried him myself. I know what his voice sounded like, and it was <i>never that patient</i>.</p>
    <p>I have hidden the crypt key with the Hermit at the edge of Blackroot. If you mean to go down there, you'll have to want it badly enough to walk.</p>` },
  wardens: { title: 'A Page Torn from a Royal Edict', text: `<p>...and the gate of the Citadel shall answer only to the three Warden's Sigils, so that no single hand may open the way to the King.</p>
    <p>One Warden in the forest, where the first knights knelt. One Warden in the cathedral, where the bell was cast. One Warden beneath the village, where the first crack was found.</p>
    <p><i>Should all three Wardens fall, may the Crown forgive whoever made it necessary.</i></p>` },
  gallows: { title: 'Sentence, Nailed to the Gallows', text: `<p>For the crime of DIGGING beneath the town well without the Crown's leave, the miller Havel is hanged.</p>
    <p>In the margin, in a different hand: <i>"He said he heard someone calling from under the water. He said it knew his wife's name. His wife had been gone four winters. They hanged him anyway. They hanged him because he was right."</i></p>` },
  tower: { title: 'Watch Log, Final Entry', text: `<p>Night 10,950. The eclipse holds. No riders on the south road. The thing in the crater still sings at the turning of each hour; we have stopped writing it down.</p>
    <p>Night 10,951. The bell in the village rang without a ringer. Hollis says not to worry. Hollis says the bell has always rung like that. I have been posted here eleven years and it has never once rung like that.</p>` },
  // ---------------- Blackroot Forest
  plaque: { title: 'Weathered Plaque', text: `<p><b>THE WEEPING GUARD</b></p><p>Raised by Aldric, first of his name, in honour of the knights who went below in the Year of Sealing.</p>
    <p><i>"They hide their faces not from shame, but because they have seen what they are guarding, and would not let it see them back."</i></p>` },
  hermitNote: { title: "The Hermit's Journal", text: `<p>The groundskeeper came by with a key and a look I've seen before. I keep it in the box under my bed. Take it if you must.</p>
    <p>The Sentinel walks again in the clearing to the west. She was Ser Edda once. When the root-breach opened she knelt on it and asked to be turned to stone so she would never get up. The Crown granted it. Somebody has woken her.</p>
    <p>I think it was me. I said her name out loud. I am so sorry.</p>` },
  edda: { title: "Ser Edda's Vow (carved into the Sentinel's plinth)", text: `<p>I will not look. I will not move. I will not let it pass.</p><p>And if I ever rise again, traveler, it is not me that rises. Put me back down.</p>` },
  whisper: { title: 'A Whisper Between the Birches', text: `<p>You are alone here. You are certain of it. And yet someone small is standing just behind your shoulder, telling you a secret only you will hear:</p>
    <p><i>"His name was Aldric. He never wanted the crown. He only wanted the door to stay shut. If you ever find him... say his name. Nobody has said it in so long."</i></p>
    <p>When you turn around there are footprints in the ash, very small, leading nowhere. Your friends did not hear a thing.</p>` },
  // ---------------- The Catacombs
  decree: { title: 'Royal Decree, Year 1 of the Eclipse', text: `<p>By my hand, the city above shall be emptied into the dark, one soul each winter, that the dark may be fed and so remain where it is.</p>
    <p>Let them hate me. Hatred keeps them away from the crypts, and away from the crypts is the only place they are safe.</p><p>- A.</p>` },
  physician: { title: "Royal Physician's Record", text: `<p>The King has not eaten in eleven years. He does not sleep, and he does not age. He sits upon the great seal in the deep chamber and the screaming beneath it quiets.</p>
    <p>I asked him what is down there. He said: <i>"Everything we ever buried, and the thing that taught them to dig."</i></p>` },
  brotherNote: { title: 'Scratched into an Ossuary Wall', text: `<p>Hello brother. Hello brother. Hello brother. Hello brother. Hello brother. Hello brother. Hello brother.</p>
    <p>It goes on for the whole wall. Near the bottom the handwriting changes, becomes neat, patient, almost kind: <i>"Let me in and I will tell you what he sounded like."</i></p>` },
  // ---------------- The Sunken Cathedral
  maudNote: { title: "Sister Maud's Prayer Card", text: `<p>Bishop Calloway rang the great bell every hour for two hundred years so the dark below would sleep. When his arms failed he had the bell strapped to his back so he could ring it with his whole body.</p>
    <p>He is still ringing it. That is the sound you hear across the crater. Every hour, on the hour, a man who should have died long ago, keeping a promise nobody remembers he made.</p>` },
  hymnal: { title: 'Waterlogged Hymnal', text: `<p>Most pages have dissolved. One line survives, underlined three times:</p><p><i>"Ring that they sleep. Ring that they sleep. If the ringing stops, run."</i></p>` },
  calloway: { title: "Calloway's Last Sermon", text: `<p>My flock asks why the Crown sends their children below. I tell them: because something down there is hungry, and the only thing it will accept in place of all of us is some of us.</p>
    <p>That is not a sermon. That is arithmetic. God help me, the arithmetic is correct.</p>` },
  // ---------------- The Ashen Citadel
  oath: { title: "Knight-Captain's Oath", text: `<p>We of the Ashen Guard swear to stand between the King and any who would reach him.</p>
    <p>Understand this, reader, if you have come this far with a sword in your hand: <b>we do not guard him from you. We guard you from what he sits upon.</b></p><p>If he has fallen, do not let them out.</p>` },
  corvaneLetter: { title: 'A Letter Never Sent', text: `<p>Aldric - my King, my friend - you asked me to keep them away, and I have, for three hundred years. I have killed farmers and children and pilgrims who only wanted to see you. I have killed them kindly. I have killed them for their own good.</p>
    <p>I am so tired. If someone finally gets past me, I hope they are strong enough to do what neither of us could.</p><p>- Corvane</p>` },
  // ---------------- The King's Below
  stones: { title: 'Inscription on the Wall of Names', text: `<p>Thousands of names, carved small, floor to ceiling. Beside each, a year. The last name was carved last winter.</p>
    <p>At the very top, carved larger than the rest, the first name of all: <b>ALDRIC</b>, and no year at all.</p>` },
  finalRecord: { title: "The King's Final Record", text: `<p>If you are reading this, I have failed, and you have killed what was left of me. I do not blame you. I wrote you the letter.</p>
    <p>Hear the truth that my kingdom never did: <b>the monsters were never invading Veyr. They are escaping from beneath it.</b> Every soul I sent below became a stone in the wall that holds them. Three hundred years of stones. And I am the keystone.</p>
    <p>The eclipse is not a curse. It is the lid.</p>
    <p>Now you must choose. Keep the prison sealed and the dark stays below - and the kingdom stays dark. Destroy it and the sun returns - and so does everything beneath it. Or sit where I sat, and wait, as I waited, for someone to come.</p>
    <p><i>I am sorry. I would have liked to see the sun one more time.</i></p>` },
};

// lost children's toys: optional collectibles scattered across Veyr
HC.TOYS = [
  { id: 'toy1', name: 'A Wooden Horse', where: 'village' }, { id: 'toy2', name: 'A Rag Doll Without Eyes', where: 'forest' },
  { id: 'toy3', name: 'A Tin Soldier', where: 'citadel' }, { id: 'toy4', name: 'A Small Shoe, Still Wet', where: 'crater' },
  { id: 'toy5', name: 'A Bone Whistle', where: 'catacombs' },
];

HC.NPCS = {
  pilgrim: { name: 'The Pilgrim', lines: [
    'Ah. You came back. You are early this time.',
    "The gate of the Citadel won't open for one person. It wants three Sigils, from three Wardens. One in Blackroot to the west. One in the drowned cathedral to the east. One... beneath our feet.",
    'Thank you, by the way, for what you did in the cathedral. The little one sleeps now. ...No? Not yet? Forgive me. I get the order wrong.',
    'Last time you carried a spear. I liked the spear. You held it like you meant it.',
    "Rest by the ember if you're wounded. It remembers you, same as I do. You can travel between embers you've woken, if you know how to ask.",
    "Don't ring the bell. Nobody rings the bell. That's rather the point of it.",
  ], coop: 'How many of you are there now? ...Odd. Last time there was one more of you.',
    after: { sigils3: "All three. The gate will know you now. Go north, up the old road. Ser Hollis will pretend not to recognise you.", kingDead: "So it's done. It's always you, you know. Every single time, it's you." } },
  hermit: { name: 'Oswin the Hermit', lines: [
    "Don't stand in the doorway, the trees can see in. ...Oh. It's you. You've grown.",
    'The groundskeeper left a key with me. It is under the bed. I have not slept on that bed since. Take it, please.',
    "The statues aren't moving. I want to be very clear about that. They are not moving. You are simply standing somewhere else than you were.",
    "If the tall one finds you, don't run. Look at it. It hates being looked at. So do I, frankly.",
  ] },
  maud: { name: 'Sister Maud', lines: [
    'Can you hear him? On the hour, every hour. Bishop Calloway is still ringing.',
    "You were here yesterday. You asked me the same thing. I told you to bring him peace, and you said - you said you would. Don't you remember?",
    "He was a kind man. Whatever he is now, please. Be kind back. Quickly.",
  ] },
  hollis: { name: 'Ser Hollis', lines: [
    "Halt. ...Traveler. I don't know you. I have never seen you before in my life.",
    "The Captain is in the courtyard. He has been in the courtyard for three hundred years. He'll want to test you. He tests everyone. Nobody passes.",
    "If you see the King... tell him Hollis held the road. Tell him I never once left the road.",
  ], gateClosed: "The gate answers only to the three Sigils. Come back when you carry them. Or don't. Most don't." },
};

HC.OBJECTIVES = {
  start: 'Explore the Drowned Village. Find out why the bell rings.',
  wardens: 'Claim the three Warden\'s Sigils: Blackroot Forest (west), the Sunken Cathedral (east), and beneath the village graveyard.',
  citadel: 'All three Sigils claimed. Climb the north road to the Ashen Citadel.',
  corvane: 'Defeat the Captain of the Ashen Guard in the Citadel courtyard.',
  keep: 'Enter the Keep. Descend into the King\'s Below.',
  below: 'Find a way past the iron gate in the King\'s Below.',
  king: "Face what waits upon the Seal.",
  seal: "Read the King's final record. Approach the Seal.",
  done: 'The kingdom waits on what you chose.',
};

HC.ENDINGS = {
  seal: { title: 'The Keeper of the Dark', text: [
    'You press your palms to the seal and it drinks the warmth out of you, gratefully, the way a starving thing drinks. The cracks close. The screaming beneath the stone dwindles to a murmur, then to breathing, then to nothing at all.',
    'Above, the bell finally stops. Veyr stays dark - it will always stay dark - but the dark is quiet, and quiet is a kind of mercy.',
    'Each winter from now on, someone will have to come down here with a list. You wonder who will hate them for it.'] },
  destroy: { title: 'First Dawn', text: [
    'The seal breaks like ice on a river - one long crack, then everything at once. Light pours down the stairs, real light, for the first time in three hundred years, and you climb toward it laughing.',
    'The eclipse slides away. The Drowned Village glows gold. Somewhere a bird you have never heard before starts singing.',
    'Behind you, in the catacombs, the dead sit up in their niches. Below them, something much larger stirs, and stretches, and begins to climb toward the light as well. It has waited longer than you have.'] },
  crown: { title: 'The Hollow Crown', text: [
    'The crown is lighter than you expected. It fits. It always fit.',
    'You sit upon the seal, and the screaming beneath it quiets, and the years begin to pass very quickly and very slowly at once. Your friends visit, at first. Then their children. Then nobody.',
    'Three hundred years later, you write a letter to someone you have never met, and you seal it with wax, and you sign it with no name at all. Far above, at the ember in the square, a pilgrim smiles. <i>"See you next time."</i>'] },
};
HC.SECRET_ENDING_LINE = 'Before the end, you kneel beside the empty armour and say his name. <i>"Aldric."</i> For the first time in three hundred years, the Hollow King rests - and somewhere far below, something that has never once been afraid goes very still.';
HC.TOYS_ENDING_LINE = 'In your pack, five small things the children of Veyr left behind. You set them on the seal in a row. It is not much. It is not nothing.';

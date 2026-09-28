// Ordliste over riggens deler og sentrale fagbegreper (norsk – engelsk).
// «part» kobler et begrep til en klikkbar del i 3D-modellen.

export const PARTS = {
  pontoon: {
    no: 'Pongtong', en: 'Pontoon',
    text: 'De to store undervannsskrogene som gir oppdrift. På borelokasjon ballasteres riggen ned til ca. 23 m dypgang, slik at pongtongene ligger under bølgene og riggen beveger seg lite.',
  },
  column: {
    no: 'Søyle', en: 'Column',
    text: 'Fire søyler bærer dekket over pongtongene. Liten vannlinjeflate gjør at en halvt nedsenkbar rigg får lang egenperiode i hiv og ligger stille i store bølger.',
  },
  brace: {
    no: 'Stag', en: 'Bracing',
    text: 'Tverrstag mellom pongtongene som tar opp krefter fra bølgene og holder konstruksjonen stiv.',
  },
  deckbox: {
    no: 'Dekkskasse og hoveddekk', en: 'Deck box / main deck',
    text: 'Den bærende dekkskassen med maskinrom, lager og tanker. På toppen ligger hoveddekket med rørdekk, slamanlegg og kraner.',
  },
  derrick: {
    no: 'Boretårn', en: 'Derrick',
    text: 'Stålfagverk på ca. 55 m som bærer kronblokken. Høyden gjør at man kan håndtere stativ på 28,5 m (tre borerør) av gangen.',
  },
  crown: {
    no: 'Kronblokk og hivkompensator', en: 'Crown block / crown-mounted compensator (CMC)',
    text: 'Skiver i toppen av tårnet som borewiren går over. Den kronemonterte hivkompensatoren holder vekten på krona jevn mens riggen hiver opp og ned.',
  },
  block: {
    no: 'Løpeblokk', en: 'Travelling block',
    text: 'Blokken som henger i borewiren og løfter toppdrevet og borestrengen. Med 12 løp deler den lasten på mange parter av wiren.',
  },
  topdrive: {
    no: 'Toppdrev', en: 'Top drive',
    text: 'Elektrisk motor som roterer borestrengen fra toppen og samtidig leder slammet ned i strengen. Opptil ca. 75 kN·m dreiemoment.',
  },
  drillfloor: {
    no: 'Boredekk', en: 'Drill floor / rig floor',
    text: 'Arbeidsdekket rundt brønnsenteret. Høyden over havet er referansen for alle dybder (RKB – rotary kelly bushing), her 27 m.',
  },
  rotary: {
    no: 'Rotasjonsbord og kiler', en: 'Rotary table / slips',
    text: 'Åpningen i boredekket der borestrengen går ned. Kilene (slips) holder strengen når toppdrevet kobles fra under en kobling.',
  },
  drawworks: {
    no: 'Heiseverk', en: 'Drawworks',
    text: 'Stor vinsj med trommel som spoler borewiren inn og ut, og dermed heiser og senker løpeblokken.',
  },
  cabin: {
    no: 'Borebu', en: "Driller's cabin",
    text: 'Borerens kontrollrom med stoler og skjermer (borekonsoll) der pumper, rotasjon, heiseverk og brønnkontroll styres.',
  },
  roughneck: {
    no: 'Jernsjauer', en: 'Iron roughneck',
    text: 'Maskin som skrur rørene sammen og fra hverandre med riktig tiltrekkingsmoment (make-up og break-out).',
  },
  racker: {
    no: 'Rørhåndteringsmaskin', en: 'Pipe racker / pipe handler',
    text: 'Robotarm som flytter stativ mellom rørstativet og brønnsenteret.',
  },
  setback: {
    no: 'Rørstativ og fingerbrett', en: 'Setback and fingerboard',
    text: 'Stativ på 28,5 m står oppreist på boredekket og holdes på plass i fingerbrettet høyt oppe i tårnet.',
  },
  drillpipe: {
    no: 'Borestreng', en: 'Drill string',
    text: 'Borerør (DP), tunge borerør (HWDP) og vektrør (DC) skrudd sammen. Strengen overfører rotasjon og slam til borekrona.',
  },
  catwalk: {
    no: 'Rørrampe og V-dør', en: 'Catwalk / V-door',
    text: 'Rampe der rør og foringsrør mates fra rørdekket opp til boredekket gjennom åpningen i tårnet (V-døren).',
  },
  pipedeck: {
    no: 'Rørdekk', en: 'Pipe deck',
    text: 'Lagringsområde for borerør, foringsrør og stigerør.',
  },
  crane: {
    no: 'Kran', en: 'Pedestal crane',
    text: 'Dekkskraner som løfter last mellom forsyningsskip og rigg.',
  },
  lq: {
    no: 'Boligkvarter', en: 'Living quarters (LQ)',
    text: 'Lugarer, messe, kontorer og sykestue for opptil ca. 120 personer om bord.',
  },
  helideck: {
    no: 'Helikopterdekk', en: 'Helideck',
    text: 'Landingsplass for helikopter som frakter personell til og fra land.',
  },
  lifeboat: {
    no: 'Livbåt', en: 'Lifeboat (TEMPSC)',
    text: 'Fritt-fall- eller davitt-livbåter med plass til alle om bord. Oransje for å være lett synlige.',
  },
  mud: {
    no: 'Slamanlegg og vibrasjonssikter', en: 'Mud system / shale shakers',
    text: 'Slamtanker, blandeutstyr, vibrasjonssikter (shale shakers), avgasser og sentrifuger som renser og vekter opp borevæsken.',
  },
  pumps: {
    no: 'Slampumper', en: 'Mud pumps',
    text: 'Tre triplex stempelpumper på 2200 hk som presser slammet ned gjennom borestrengen med opptil ca. 345 bar.',
  },
  burner: {
    no: 'Brennerbom', en: 'Burner boom',
    text: 'Utligger for fakling av olje og gass under brønntesting.',
  },
  riser: {
    no: 'Stigerør', en: 'Marine riser',
    text: 'Rør (21") fra BOP-en på havbunnen opp til riggen. Slammet og borekakset strømmer tilbake til riggen i stigerøret. Oppdriftsmoduler gjør det lettere.',
  },
  tensioner: {
    no: 'Stigerørstrekkere og teleskopledd', en: 'Riser tensioners / telescopic joint',
    text: 'Hydrauliske strekkere holder stigerøret i strekk, og teleskopleddet tar opp riggens hiv.',
  },
  bop: {
    no: 'Utblåsningssikring (BOP)', en: 'Blowout preventer (BOP)',
    text: 'Ventilstakk på brønnhodet med ringromssikringer (annular) og rørsikringer (pipe rams, blind/shear rams). Stenger brønnen ved et brønnspark.',
  },
  lmrp: {
    no: 'LMRP og kontrollpoder', en: 'Lower marine riser package',
    text: 'Øvre del av BOP-stakken med ringromssikring, fleksledd og kontrollpoder. Kan kobles fra i en nødsituasjon.',
  },
  chokeline: {
    no: 'Choke- og drepeline', en: 'Choke and kill lines',
    text: 'Høytrykksrør langs stigerøret. Under dreping strømmer returen fra brønnen gjennom chokelinjen til chokemanifolden på riggen.',
  },
  wellhead: {
    no: 'Brønnhode og lederør', en: 'Wellhead / conductor',
    text: 'Brønnhodet (18¾") sitter på lederøret og holder foringsrørene. BOP-en låses på toppen av det.',
  },
  anchor: {
    no: 'Ankerliner', en: 'Mooring lines',
    text: 'Åtte ankerliner av kjetting og wire holder riggen på plass over brønnen.',
  },
  rov: {
    no: 'ROV (fjernstyrt undervannsfarkost)', en: 'Remotely operated vehicle',
    text: 'Undervannsrobot med kamera og manipulatorarmer som overvåker og betjener utstyr på havbunnen.',
  },
  psv: {
    no: 'Forsyningsskip', en: 'Platform supply vessel (PSV)',
    text: 'Frakter rør, slam, sement, drivstoff og vann til riggen.',
  },
  casing: {
    no: 'Foringsrør og sement', en: 'Casing and cement',
    text: 'Stålrør som sementeres i brønnen for å sikre hullet og isolere formasjoner med ulikt trykk.',
  },
  bit: {
    no: 'Borekrone', en: 'Drill bit',
    text: 'Knuser eller skjærer bergarten. PDC-kroner har skjær av syntetisk diamant; rullekroner har tre roterende kjegler.',
  },
  reservoir: {
    no: 'Reservoar', en: 'Reservoir',
    text: 'Porøs og permeabel bergart (her Brent-sandstein) med olje og gass fanget under en tett takbergart i en antiklinal felle.',
  },
};

// Fagbegreper brukt i simulatoren
export const TERMS = [
  ['RKB', 'Rotary kelly bushing – referansepunktet på boredekket. «m RKB» er dybde målt derfra.'],
  ['MD / TVD', 'Målt dybde langs brønnen / sann vertikal dybde. Brønnen her er vertikal, så MD = TVD.'],
  ['Slamvekt (MW)', 'Borevæskens tetthet i sg (spesifikk vekt). Hydrostatisk trykk: P = 0,0981 · sg · dybde (bar, m).'],
  ['ECD', 'Ekvivalent sirkulasjonstetthet: slamvekt pluss friksjonstapet i ringrommet omregnet til tetthet.'],
  ['Poretrykk', 'Trykket i porevæsken i bergarten. Slamvekten må være høyere for å hindre innstrømning.'],
  ['Oppsprekkingsgradient', 'Trykket som sprekker opp formasjonen. ECD må være lavere for å unngå tap av slam.'],
  ['FIT / LOT', 'Formasjonsstyrketest / leak-off-test under ny foringsrørsko. Gir maksimal slamvekt for neste seksjon.'],
  ['WOB', 'Weight on bit – vekten på borekrona (tonn). Krokvekten faller like mye som WOB øker.'],
  ['ROP', 'Rate of penetration – borehastighet (m/h). Modellert med Bourgoyne–Young.'],
  ['SPP', 'Standpipe pressure – pumpetrykket. Summen av friksjonstap i streng, krone og ringrom.'],
  ['Krokvekt', 'Vekten som henger i kroken: løpeblokk + toppdrev + strengen i slam (oppdrift) − WOB.'],
  ['Oppdriftsfaktor', 'BF = 1 − ρslam/ρstål. Strengen veier mindre i slam enn i luft.'],
  ['Kobling (connection)', 'Å skru på et nytt stativ når toppdrevet har nådd boredekket.'],
  ['Brønnspark (kick)', 'Uønsket innstrømning av formasjonsvæske fordi brønntrykket er lavere enn poretrykket.'],
  ['Tankøkning (pit gain)', 'Økning i slamtankene – det viktigste tegnet på brønnspark.'],
  ['SIDPP / SICP', 'Stengt borerørstrykk / stengt foringsrørstrykk etter at BOP er stengt.'],
  ['Drepeslam (KMW)', 'KMW = OMW + SIDPP / (0,0981 · TVD).'],
  ['ICP / FCP', 'Initielt og endelig sirkulasjonstrykk under dreping: ICP = SIDPP + SCR, FCP = SCR · KMW/OMW.'],
  ['SCR', 'Slow circulating rate – pumpetrykk ved sakte drepehastighet (her 30 slag/min).'],
  ['MAASP', 'Maksimalt tillatt ringromstrykk på overflaten før formasjonen ved skoen sprekker.'],
  ['Vent-og-vekt', 'Drepemetode der drepeslam blandes først og pumpes i én sirkulasjon.'],
  ['Borerens metode', 'Drepemetode med to sirkulasjoner: først sirkuleres gassen ut, så pumpes drepeslam.'],
  ['dc-eksponent', 'Normalisert boreeksponent. Faller når poretrykket øker – et varsel om overtrykk.'],
  ['Koblingsgass', 'Gasstopp som kommer når pumpene har stått under en kobling. Tegn på liten overbalanse.'],
  ['Bottoms up', 'Tiden (eller slagene) det tar å sirkulere slam fra krona opp til overflaten.'],
  ['Stick-slip', 'Torsjonssvingninger der krona stopper og spinner. Gir slitasje; løses med høyere RPM eller lavere WOB.'],
  ['Hiv (heave)', 'Riggens bevegelse opp og ned i bølgene. Hivkompensatoren holder vekten på krona jevn.'],
  ['Barytt', 'Tungt mineral (sg 4,2) som brukes til å vekte opp slammet.'],
];

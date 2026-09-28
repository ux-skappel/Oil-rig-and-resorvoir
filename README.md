# Nordsjøbrønnen

En offshore boresimulator i 3D og et PVT-laboratorium for reservoarvæsken, laget for å lære boring og reservoarfysikk på norsk.

Du er borer på en halvt nedsenkbar rigg i nordlige Nordsjøen (fiktiv brønn 35/13-1, 350 m havdyp). Brønnen bores fra havbunnen ned i Brent-reservoaret. Underveis tar du koblinger, velger slamvekt, følger med på trykk og gass, og stenger og dreper brønnen hvis den får et brønnspark.

## Slik starter du

Siden bruker JavaScript-moduler, så den må åpnes via en webserver (ikke direkte som fil):

```bash
python3 -m http.server 8080
# åpne http://localhost:8080 i nettleseren
```

Three.js og MathJax lastes fra `cdn.jsdelivr.net`, så du trenger internett.

Kjør testene av fysikken (Node 18 eller nyere):

```bash
npm test
```

## Hva som er med

### Boresimulator (3D)
- **Riggen:** Halvt nedsenkbar rigg med pongtonger, søyler, dekkskasse, boretårn, kronblokk med hivkompensator, løpeblokk, toppdrev, heiseverk, borebu, jernsjauer, rørhåndtering, rørstativ, kraner, boligkvarter, helikopterdekk, livbåter, slamanlegg og brennerbom.
- **Under vann:** Stigerør med oppdriftsmoduler, teleskopledd og strekkere, choke- og drepeline, BOP-stakk med LMRP, brønnhode, ankerliner, ROV og et forsyningsskip. Uten stigerør vises borestrengen i åpent vann og borekakset ved havbunnen.
- **Geologisk snitt:** Formasjonene fra Nordland Gp til Dunlin Gp i en antiklinal felle, med gass, olje og vann (OWC 3015 m) og et brønnskjema der bredden er overdrevet.
- **Klikkbare deler:** Klikk på en del for å se navnet på norsk og engelsk og en forklaring.

### Borefysikk
- **Hydraulikk:** Bingham-plastisk modell for friksjon i streng og ringrom, trykktap over kronedysene, jetkraft, ECD og hullrensk.
- **Borehastighet:** Bourgoyne–Young-modellen (8 ledd), kroneslitasje og dc-eksponent.
- **Dreiemoment:** Moment på krona og i strengen, stick-slip med torsjonsperiode 4L/c og grenser for toppdrevet.
- **Krokvekt og hiv:** Krokvekt med oppdrift, aksial stivhet i strengen og riggens hiv med og uten hivkompensator.
- **Slam og tanker:** Slamtanker og returer med plugg-strøm-modell, oppvekting med barytt og fortynning.
- **Poretrykk og oppsprekking:** Poretrykk, oppsprekkingsgradient og FIT/LOT. Prognosen i boreprogrammet undervurderer trykket i Brent.
- **Brønnspark:** Innstrømning fra permeable soner. Gassen ekspanderer (reell gass, Z-faktor fra DAK) og migrerer oppover, og kompressibilitet gir de stengte trykkene.
- **Brønnkontroll:** Hard stenging, SIDPP/SICP, drepeark (KMW, ICP, FCP, SCR, MAASP), vent-og-vekt og borerens metode. Choken kan styres automatisk etter borerørstrykket eller manuelt.
- **Operasjoner:** Koblinger, strømningssjekk, rundtur for kronebytte (med kontroll av svabbing), foringsrør og sementering, FIT, og kjøring av BOP og stigerør etter 20" foringsrør.

### PVT-lab
- **Svartolje:** Standing, Vasquez–Beggs, Glasø (Nordsjøen), Al-Marhoun og Petrosky–Farshad for Pb, Rs og Bo. Viskositet fra Beggs–Robinson, Glasø, Egbogah–Ng, Chew–Connally, Vasquez–Beggs og Beal. Kompressibilitet (mettet og undermettet), tetthet og Bt.
- **Gass:** Pseudokritiske egenskaper fra Sutton og Standing med Wichert–Aziz-korreksjon. Z-faktor fra Hall–Yarborough, Dranchuk–Abou-Kassem, Papay og Beggs–Brill. I tillegg Bg, tetthet, Lee–Gonzalez–Eakin-viskositet og kompressibilitet.
- **Vann:** McCain (Bw, viskositet, tetthet, løst gass) og Osif (kompressibilitet).
- **Peng–Robinson:** Stabilitetstest (Michelsen), flash, metningstrykk og faseomhylning med kritisk punkt. C7+ karakteriseres med Søreide og Kesler–Lee, med Pedersen-splitting som valg. Peneloux volumforskyvning og Lohrenz–Bray–Clark-viskositet.
- **Laboratorieforsøk:** CCE, differensiell frigjøring og separatortest.
- **Volumberegning:** STOOIP og løst gass.
- **Likninger:** Alle likningene vises med kilder.

## Struktur

```
index.html            Siden (HTML og CSS)
js/main.js            Oppstart og faner
js/drill/             Boresimulator: config, sim, hydraulics, rop, wellbore, 3D-scene og brukergrensesnitt
js/pvt/               PVT: blackoil, gas, water, eos, components, lab, equations og brukergrensesnitt
js/ui/chart.js        SVG-diagrammer
tests/                Kontroll mot lærebokverdier (node --test)
tools/                Bygging av artefaktversjonen
```

## Forbehold

Simulatoren er laget for læring. Modellene er etablerte lærebokmodeller, men de er forenklet (for eksempel én gassboble og en vertikal brønn). Tallene er realistiske, men skal ikke brukes til planlegging av ekte brønner.

## Kilder (utvalg)

- Bourgoyne, Millheim, Chenevert, Young: *Applied Drilling Engineering*, SPE (1986)
- McCain: *The Properties of Petroleum Fluids*, PennWell (1990)
- Ahmed: *Reservoir Engineering Handbook*, Elsevier
- Whitson & Brulé: *Phase Behavior*, SPE Monograph 20 (2000)
- Michelsen & Mollerup: *Thermodynamic Models: Fundamentals & Computational Aspects*
- Glasø, Ø.: Generalized Pressure-Volume-Temperature Correlations, JPT (1980)
- IWCF: Well Control-pensum (drepeark, vent-og-vekt og borerens metode)

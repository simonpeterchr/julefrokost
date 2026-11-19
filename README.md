# Julefrokost

Et festspil til julefrokosten: **storskærmen** (tv'et) viser legene, **gæsterne** er med fra telefonen ved at scanne en QR-kode, og **værten** styrer det hele fra sin egen telefon eller tablet.

Det følger med:

- **Julekuponen** (tip 13): væddemål om aftenen og gæsterne, som alle krydser af på telefonen
- **Finsk polka**: kendte hits i finsk humppa-udgave – originalen spiller, når svaret vises
- **Hvornår var det nu det var?**: gæt årstallet på et billede – medfølgende billeder af kendte begivenheder og jeres egne
- **Emoji-julefilm**, **Flaske eller frøken?** (citater, læses højt), **Pony eller pornostjerne?** og **Veer eller vellyst?** (kræver egne billeder)
- **Julemusik** med ønsker fra telefonerne (alt på YouTube kan ønskes)
- **Pakkeleg** med skjult nedtælling, **tilfældige skål**, **snapsealarm** og **piña colada-alarm**
- Resultat efter hver quiz og samlet stilling

Tre af runderne er frække og ikke for børn. Værten bestemmer selv, hvad der bliver spillet.

## Kom i gang på din egen computer

Du skal bruge en computer, der kan sættes til tv'et (HDMI, Chromecast eller AirPlay), og [Node.js](https://nodejs.org) version 20 eller nyere. Der skal ikke installeres andet.

1. Hent mappen (på GitHub: **Code → Download ZIP**) og pak den ud.
2. Start programmet: dobbeltklik på `start.command` (Mac) eller `start.bat` (Windows) – eller skriv `node server.js` i en terminal i mappen.
3. Åbn **http://localhost:8080** i Chrome eller Edge, og vælg **Hold din egen fest**. Du får en **værtskode** – skriv den ned.
4. På værtssiden: skriv gæsterne under **Gæster**, lav kuponen under **Julekuponen** (knappen *Forslag til kupon* giver 13 væddemål), og læg evt. egne billeder ind under **Billeder**.
5. Tryk **Åbn storskærm her**, træk vinduet over på tv'et, og klik én gang på det (så må det spille lyd og gå i fuld skærm).
6. Gæsterne scanner QR-koden på tv'et. De skal være på **samme wifi** som computeren.

Vil du styre fra telefonen i stedet for computeren, så åbn adressen, der står under **Indstillinger → Adgang** på værtssiden, og skriv værtskoden.

> **Vigtigt om YouTube:** Åbn storskærmen via `localhost` (eller et rigtigt domænenavn) – ikke via computerens IP-adresse. YouTube nægter at afspille mange musikvideoer på sider, der er åbnet via en IP-adresse (fejl 150). Telefonerne må gerne bruge IP-adressen; de afspiller ingenting.

## Storskærmen: tv, computer, Chromecast eller AirPlay

Storskærmen er en almindelig webside. Den kan vises sådan:

| Sådan | Gør dette |
| --- | --- |
| Computer med HDMI-kabel | Tryk **Åbn storskærm her** på værtssiden, og klik én gang på siden. |
| Chromecast | Åbn storskærmen i Chrome på en computer, vælg **Cast** i Chromes menu (⋮), og vælg **Cast fane**. |
| AirPlay (Apple TV) | Åbn storskærmen på en Mac, iPad eller iPhone, og brug **Skærmdeling** til tv'et. |
| Smart-tv'ets egen browser | Kræver, at spillet ligger på et domæne (se nedenfor). Åbn `domænet/tv` på tv'et: det viser seks tal. Tryk **Tilslut et tv** på værtssiden, og skriv tallene. |

På storskærmen åbner **OK** på fjernbetjeningen (Enter på et tastatur eller et museklik) en menu, hvor legene kan startes med piletasterne.

Smart-tv-browsere er meget forskellige. Nyere tv'er (ca. 2020 og frem) burde kunne vise siden, men det er ikke afprøvet på rigtige tv'er, og nogle kan ikke spille flere YouTube-klip i træk eller starter ikke lyden selv. Driller tv'et, så brug en computer, Chromecast eller AirPlay.

Brug Chrome eller Edge til storskærmen. I Safari skal automatisk afspilning først tillades for siden (**Safari → Indstillinger for dette websted → Automatisk afspilning → Tillad al automatisk afspilning**).

## Egne billeder

Under **Billeder** på værtssiden:

- **Hvornår var det nu det var?** Tryk **Vælg billeder**, vælg et eller flere, tjek årstallet ved hvert billede (det foreslås ud fra billedets dato), og tryk **Læg ind**. Årstallet kan rettes bagefter, og billeder kan slettes. De medfølgende billeder kan slås fra med fluebenet.
- **Veer eller vellyst?** Vælg ansigter, og angiv for hvert, om det er fra en fødsel eller en film. Runden kommer først frem i programmet, når der ligger billeder. Brug kun billeder, I har lov til at bruge.

Billederne skaleres ned i browseren, før de sendes, og oplysninger fra kameraet (fx hvor billedet er taget) følger ikke med. Der er plads til 300 billeder og 120 ansigter pr. fest. Billederne ligger kun på den computer, serveren kører på (`data/rum/<festens id>/billeder/`), og kun værten og storskærmen kan hente dem.

Driver du serveren, kan du give **alle** fester på den ansigter fra start: læg billederne i `data/ansigter/foedsel/` og `data/ansigter/porno/`. Hver vært kan slå dem fra under **Billeder**. Mappen ligger i `data/` og er aldrig med i git.

En egen snapsevise kan lægges som `data/rum/<festens id>/billeder/lyd/snaps.mp3`. Ellers spilles en udgave fra YouTube.

## Sæt den på et domæne

Ligger spillet på et domæne, behøver gæsterne ikke være på samme wifi, storskærmen kan køre i et smart-tv's browser, og flere kan holde hver deres fest på samme server – hver fest har sin egen adresse, kode, værtskode og sine egne billeder.

Spillet er et program, der skal køre (Node.js) – det kan ikke bare lægges som filer på et almindeligt webhotel. Det nemmeste er en computer, der er tændt, og en [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) fra domænet til `http://localhost:8080`.

Lav filen `config.json` ved siden af `server.js` (se `config.eksempel.json`):

```json
{
  "port": 8080,
  "publicUrl": "https://fest.eksempel.dk",
  "opretKode": "vælg-jeres-egen-kode",
  "trustProxy": true
}
```

| Indstilling | Miljøvariabel | Betydning |
| --- | --- | --- |
| `port` | `PORT` | Porten, serveren lytter på (8080). |
| `publicUrl` | `PUBLIC_URL` | Adressen udefra. QR-koden peger herhen. |
| `opretKode` | `OPRET_KODE` | Sat: kun dem, der kender koden, kan oprette en fest. Sæt den altid på en offentlig server. |
| `trustProxy` | `TRUST_PROXY` | `true` bag Cloudflare eller en anden proxy (så gæsternes rigtige adresse bruges til spærring af gætteri). |
| `maxRum` | `MAX_RUM` | Højst så mange fester på én gang (50). |
| `rumDage` | `RUM_DAGE` | En fest, værten ikke har rørt i så mange dage, slettes med billeder (60). |
| `data` | `DATA` | Mappen med festernes data (`data/`). |

Værten kan selv slette sin fest med alle billeder under **Indstillinger → Slet festen**.

Windows, start automatisk (PowerShell som administrator, mappen ligger i `C:\Julefrokost`):

```powershell
$a = New-ScheduledTaskAction -Execute "C:\Program Files\nodejs\node.exe" -Argument "server.js" -WorkingDirectory "C:\Julefrokost"
$t = New-ScheduledTaskTrigger -AtStartup
$s = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit 0 -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
$p = New-ScheduledTaskPrincipal -UserId "S-1-5-18" -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName "Julefrokost" -Action $a -Trigger $t -Settings $s -Principal $p -Force
Start-ScheduledTask Julefrokost
```

Opdatering fra en Mac eller Linux-maskine med SSH-adgang til Windows-maskinen: `./deploy-windows.sh bruger@maskine`. Festernes data og `config.json` røres ikke.

## Godt at vide

- **Sikkerhed:** Værtssiden og storskærmen kræver værtskoden (otte tegn, gemt som hash). Gæsterne kan kun deltage med koden på tv'et, og deres telefoner får aldrig svarene, før de er vist. Forkerte koder spærres efter få forsøg.
- **Musikken** afspilles direkte fra YouTube. Videoer kan forsvinde eller blive spærret – så springer julemusikken videre, og i Finsk polka trykker du bare *Næste*. Søgningen til musikønsker læser YouTubes almindelige søgeside og kan holde op med at virke, hvis YouTube ændrer den.
- **Oplæsningen** i Flaske eller frøken? bruger browserens danske stemme. Har browseren ingen, står citatet bare på skærmen.
- **Tilstanden** gemmes løbende, så serveren kan genstartes midt i festen uden at point og kuponer går tabt.
- **Afprøvning:** `node tools/proev.js` spiller en hel aften igennem mod en frisk server og tjekker omkring 160 ting.

## Indhold og rettigheder

Koden er under MIT-licensen (se `LICENSE`). Billederne, skrifttyperne og quizteksterne har deres egne vilkår – se [KILDER.md](KILDER.md). De medfølgende billeder kommer fra Wikimedia Commons med fri licens, og fotograf og licens står ved hvert billede på siden `/kilder`.

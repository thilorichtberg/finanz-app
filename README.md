# Finanzen

Persönliche Finanz-App als **Progressive Web App**, gleiches Aussehen und gleiche Technik wie [Habits](https://thilorichtberg.github.io/habits/): reines HTML, CSS und JavaScript, kein Framework, kein Build, Supabase als Backend, Auslieferung über GitHub Pages. Die Oberfläche ist auf Deutsch.

## Was sie kann

- **Umsätze** per CSV-Import der Bank (Bank-Direktanbindung ist als Schablone vorbereitet)
- **Budget** aus regelmäßigem Einkommen, Fixkosten, geplanten Zahlungen und Sparrate, angezeigt als Tag, Woche und Monat
- **Tageslimit, das mitdenkt:** Wer heute überzieht, hat an den restlichen Tagen des Monats weniger
- **Kategorien über feste Regeln** (Aldi, Lidl, Penny, ESSO, Vodafone …) ohne KI und ohne API. PayPal-Zahlungen werden nach dem Händler im Verwendungszweck eingeordnet
- **Wiederkehrendes erkennen** (Abos, Miete, Strom) und als Fixposten übernehmen
- **Eigene Regeln:** Was nicht passt, landet unter „Sonstiges“. Dort legst du Regeln an („Verwendungszweck enthält …“ → Kategorie)
- **Geplante Zahlungen** (PayPal, Klarna in 30 Tagen): werden nur eingetragen, nichts wird übertragen, senken aber schon das Tageslimit
- **Budget pro Kategorie** mit Warnung ab 80 %, **Sparziele**, **mehrere Konten**, **Umbuchungen** zählen nicht als Ausgabe
- **Budgetmonat ab Tag X** (zum Beispiel 30, wenn der Unterhalt um den 30. kommt) unter Einstellungen → Budget
- **Bank-Anbindung** über Enable Banking (Edge Function `bank-sync`): Abruf von Hand (Knopf oben rechts, mit Rückfrage) und täglich automatisch um 06:00/07:00 Uhr (`supabase/bank-cron.sql`). PSD2 erlaubt automatische Abrufe nur 4-mal pro Tag und Bank. Die Freigabe läuft nach einigen Wochen ab, die App warnt 7 Tage vorher
- **Berichte:** Monatsvergleich, Ausgaben nach Händler, Export als CSV
- **Local-first:** Die App arbeitet immer lokal und gleicht angemeldet mit Supabase ab (pro Eintrag gewinnt die jüngere Änderung)

## So rechnet das Budget

```
Verfügbar im Monat = Einnahmen (Plan) − Fixkosten − offene geplante Zahlungen − Sparrate
Tageslimit heute   = (Verfügbar − bisher variabel ausgegeben vor heute) ÷ verbleibende Tage inkl. heute
```

Variabel ist jede Ausgabe in einer Kategorie, die nicht als Fixkosten markiert ist. Umbuchungen zählen nirgends, Erstattungen mindern die Ausgaben. Die Formel wird jeden Tag neu gerechnet, deshalb sinkt das Limit automatisch, wenn du überziehst. Die Logik steht in [`core.js`](core.js) und ist in `tests/core.test.js` getestet.

## Mit Habits verbunden

Beide Apps liegen unter derselben Adresse `thilorichtberg.github.io` (Habits unter `/habits/`, diese App unter `/finanz-app/`). Dadurch teilen sie den Browser-Speicher: **eine Anmeldung gilt für beide**, solange beide dasselbe Supabase-Projekt benutzen. Ein zusätzliches „GitHub Pages“ ist nicht nötig, jedes Repository bekommt seinen eigenen Pfad. Der Umschalter steht in der Seitenleiste „Meine Apps“. Wie Habits darauf verweist, steht in [`habits-verknuepfung.md`](habits-verknuepfung.md).

## Projektstruktur

| Pfad | Inhalt |
|---|---|
| `index.html`, `style.css` | Seite und Gestaltung (Tokens aus `design-regeln.md`) |
| `core.js` | reine Logik: CSV, Regeln, Wiederkehrendes, Budget (läuft auch in Node) |
| `app.js` | Speicher, Cloud-Abgleich, Navigation, Dialoge, Drück-Animation |
| `views.js`, `forms.js`, `boot.js` | Ansichten, Formulare und Einstellungen, Aktionen und Start |
| `sw.js`, `manifest.webmanifest`, Icons | Offline, Updates, Installierbarkeit |
| `vendor/supabase.js` | supabase-js 2.45.4, lokal eingebunden |
| `supabase/finanz.sql` | Tabelle `fin_items` mit Row Level Security |
| `supabase/bank.sql`, `supabase/bank-cron.sql`, `supabase/functions/bank-sync/` | Bank-Anbindung: Tabelle, Tageszeitplan, Edge Function |
| `tests/` | Logik-Tests (`node tests/core.test.js`) und Oberflächen-Prüfung (`tests/ui-check.js`) |
| `tools/stamp.py` | stempelt vor jeder Veröffentlichung eine neue Version |

## Einrichten

1. Im Supabase SQL Editor `supabase/finanz.sql` ausführen (dasselbe Projekt wie Habits).
2. Lokal ausprobieren: `python3 -m http.server 8080 --bind 127.0.0.1`, dann <http://localhost:8080> öffnen. Ohne Anmeldung läuft alles lokal.
3. Veröffentlichen: `python3 tools/stamp.py`, committen, pushen. GitHub Pages liefert den Branch `main` aus.
4. In der App unter Einstellungen → Konto & Cloud anmelden (oder in Habits, die Anmeldung gilt für beide).

Der Publishable Key in `app.js` ist öffentlich vorgesehen. Geschützt sind die Daten durch Login und Row Level Security. Niemals den `service_role`-Key oder Bank-Schlüssel in den Browser-Code schreiben.

## Tests

```bash
node tests/core.test.js                                   # Logik inklusive Beispiel-CSV, falls vorhanden
NODE_PATH=<ordner mit playwright-core> node tests/ui-check.js   # Handy-Viewports 375 und 390 px, hell und dunkel
```

Die Beispiel-CSV mit echten Umsätzen gehört nicht ins Repository (siehe `.gitignore`).

## Drittanbieter

[supabase-js](https://github.com/supabase/supabase-js) (MIT) unter `vendor/`, Symbole im Stil von [Lucide](https://lucide.dev) (ISC).

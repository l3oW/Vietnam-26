# Unser Vietnam · Familienreise 2027

Private Familien-Reiseapp für eine 14-tägige Vietnamreise von Nord nach Süd. Der Repositoryname „Vietnam-26“ bleibt bestehen; die vorläufigen Reisedaten sind 15.–28. Mai 2027.

## Funktionen

- Bearbeitbarer Reiseplan mit 14 Tagen: Hanoi, Ninh Bình, Hội An/Đà Nẵng, Saigon und Mekongdelta.
- Gemeinsame Tagesquests und eine Früchte-Probierliste.
- Familienalbum: mehrere Fotos hochladen, einem Reisetag zuordnen, ansehen und herunterladen.
- Vlogs: MP4-/WebM-Upload, Kamera-/Mikrofonaufnahme im Browser sowie YouTube-/Vimeo-Links.
- La Siesta Hoi An Resort & Spa als austauschbarer 5-Sterne-Vorschlag, ausdrücklich noch nicht gebucht.
- Gemeinsame Speicherung in Cloudflare D1 und R2; keine gerätegebundene Scheinsynchronisation.
- Responsive Oberfläche, private Anmeldung, serverseitige Prüfung von Uploads und Änderungsständen.

## Lokal starten

Node.js ab 22.13 erforderlich (für `node:sqlite`); empfohlen ist eine aktuelle Node-Version. Keine Paketinstallation erforderlich.

```sh
npm run dev
```

Unter `http://127.0.0.1:5173` öffnen. „Mit ChatGPT anmelden“ simuliert ausschließlich in der lokalen Vorschau einen Familiennutzer. Daten liegen in `.local-data/` und gehören nicht ins Repository. Die Simulation ist nicht Teil des produktiven Workers.

```sh
npm test
npm run build
```

## Inhalte ändern

Reisedaten, Hotel und Tagespläne lassen sich in der App bearbeiten. Der ursprüngliche Plan steht in `web/trip.mjs`. `web/style.css` und `web/app.js` enthalten Oberfläche und Bedienung. `worker/server.mjs` enthält die authentifizierten APIs. `scripts/build.mjs` erzeugt den eigenständigen Worker samt eingebetteten Webdateien unter `dist/server/index.js`.

## Hosting und Familienzugang

`.openai/hosting.json` enthält die Site-Zuordnung und die logischen Bindings `DB` (D1) und `BUCKET` (R2). Die SQL-Migration unter `drizzle/` muss vor dem ersten produktiven API-Aufruf angewendet werden; der Build übernimmt sie nach `dist/.openai/drizzle/`. Niemals Datenbanktabellen während eines Requests anlegen.

Sites verwaltet die private Anmeldung und setzt `oai-authenticated-user-id`. Der Worker erwartet diese von einer vertrauenswürdigen Hosting-Zugriffsschicht. Bei eigenständigem Hosting muss vor Freigabe eine gleichwertige Authentifizierung eingerichtet werden; eingehende Identitätsheader niemals ungeprüft aus dem Internet übernehmen.

Die App startet privat. Der Familienlink allein gewährt keinen Zugriff: Familienmitglieder müssen ausdrücklich über die Zugriffsverwaltung freigegeben werden. Alle freigegebenen Mitglieder bearbeiten denselben Reiseplan und sehen dasselbe Album; Uploads kann nur die hochladende Person löschen. GitHub hostet den Quellcode, nicht automatisch die funktionsfähige Webapp.

## Medien

Bilder: JPG, PNG, WebP, GIF, AVIF bis 12 MB. Videos: MP4/WebM bis 50 MB. Browseraufnahme bis zwei Minuten; Browser und Betriebssystem bestimmen die verfügbaren Formate. Bei Kamera-/Mikrofonverweigerung bleibt der Dateiupload nutzbar. Größere Videos können per YouTube-/Vimeo-Link eingebunden werden. Externe Player werden erst nach einem Klick geladen.

Das Titelbild lädt ein externes Vietnamfoto von Unsplash; ohne Bildverbindung bleibt eine lokale SVG-Landschaft sichtbar. Webfonts sind optional und besitzen lokale Ersatzschriften. Eigene Familienbilder und Vlogs liegen ausschließlich im privaten Medienspeicher, nicht im Git-Repository.

Alle Flugzeiten, Hotels und Ausflüge sind vorläufige Vorschläge. Preis, Verfügbarkeit, Saison und Tierbeobachtungen sind nicht garantiert.


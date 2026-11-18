# Habits mit Finanzen verbinden

Im Habits-Projekt steht in `app.js` (Abschnitt „Seitenleiste: weitere Apps“) der Eintrag „Finanzen“ als gesperrter Knopf mit „Bald“. Ersetze diese Zeile:

```js
<li><button type="button" class="app-item" disabled>${icon('wallet')}<span class="app-name">Finanzen</span><span class="soon">Bald</span></button></li>
```

durch einen Link (die Adresse gilt, sobald das Finanz-Repository `finanz-app` heißt und GitHub Pages aktiv ist):

```js
<li><a class="app-item" href="https://thilorichtberg.github.io/finanz-app/">${icon('wallet')}<span class="app-name">Finanzen</span></a></li>
```

In `style.css` von Habits ergänzen, damit ein Link wie die Knöpfe aussieht:

```css
a.app-item { color: inherit; text-decoration: none; }
a.app-item:active { background: var(--surface-2); }
```

Danach `python3 tools/stamp.py`, committen, pushen. Die Anmeldung muss nicht erneut erfolgen, weil beide Apps denselben Browser-Speicher teilen.

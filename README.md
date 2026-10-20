# Rochy Hub

Panel administrativo web para Rochy Entrena. Esta primera etapa incluye la estructura base, el layout y pantallas de referencia con datos ficticios.

## Requisitos

- Node.js 24.19.0 (misma versión que GitHub Actions)
- npm

## Cómo ejecutar en local

```bash
npm install
npm start
```

Luego abrir [http://localhost:4200/](http://localhost:4200/). La raíz redirige a `/#/dashboard`.

## Compilar

```bash
npm run build
```

## Tests

```bash
npm test
```

## Publicar en GitHub Pages

Repositorio existente: `GmasT3rr/rochi.entrena`. Rama de publicación: `main`.
El repositorio todavía no tiene commits; el primer push creará la rama remota.
No es necesario cambiar el remoto ni volver a ejecutar `git init`.

1. En GitHub, abrir **Settings > Pages > Build and deployment** y elegir
   **GitHub Actions** como Source.
2. Verificar que GitHub Actions esté habilitado en **Settings > Actions > General**.
3. Luego del primer push, verificar **Settings > Branches > Default branch**: debe ser `main`.

Para verificar la compilación utilizada en el despliegue:

```bash
npm ci
npm run build -- --configuration production --base-href /rochi.entrena/
```

El workflow `.github/workflows/deploy-pages.yml` publica exclusivamente
`dist/rochy-hub/browser`, donde Angular genera `index.html` y los recursos del navegador.
Usa las acciones oficiales `configure-pages`, `upload-pages-artifact` y `deploy-pages`.
La autenticación utiliza el token automático de GitHub Actions y OIDC; no requiere
agregar credenciales ni secretos al código y no utiliza una rama `gh-pages`.

Para publicar, revisar los archivos y ejecutar manualmente:

```bash
git status
git add .
git diff --cached --stat
git commit -m "Configurar despliegue de Angular en GitHub Pages"
git push -u origin main
```

Como todos los archivos estaban sin seguimiento inicialmente, el primer commit debe
incluir el proyecto completo, incluido `package-lock.json`. Revisar lo preparado
antes del commit. `node_modules` y `dist` están excluidos por `.gitignore`.

Cada push a `main` compila y despliega automáticamente. También se puede ejecutar
**Actions > Deploy Angular to GitHub Pages > Run workflow**, seleccionando `main`.

URL prevista: https://gmast3rr.github.io/rochi.entrena/
Por ejemplo: https://gmast3rr.github.io/rochi.entrena/#/alumnos

El routing usa `withHashLocation()` para que recargar una sección no requiera
reescrituras del servidor. Los enlaces internos conservan sus rutas Angular.
El `base-href` específico de Pages se aplica al compilar; `npm start` sigue
funcionando en la raíz de localhost.

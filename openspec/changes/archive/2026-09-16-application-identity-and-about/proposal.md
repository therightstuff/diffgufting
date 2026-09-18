# Application identity and About

## Why

Development launches can expose Electron branding in the app menu, and About lacks the application's logo and project links. Users should see the same application identity and useful project information in development and packaged builds.

## What Changes

- Name the application menu diffgufting.
- Populate About from package metadata and the existing application logo.
- Add repository and support URLs to package metadata and expose clickable links in About.
- Support development and packaged launch paths.

## Capabilities

### New Capabilities

- `application-identity`: Application menu naming and package-driven About information with project links.

### Modified Capabilities

None.

## Impact

Affects `package.json`, associated lockfile metadata where applicable, desktop startup/menu setup, About presentation, packaging integration, and tests. Uses existing artwork. No new dependency is planned.

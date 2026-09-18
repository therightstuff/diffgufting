# Application identity and About design

## Context

Desktop startup uses the default Electron appMenu role and sets an icon, but has no explicit application name or package-driven About implementation. package.json supplies name, version, and description; origin identifies https://github.com/therightstuff/diffgusting.

## Goals / Non-Goals

Goals: diffgusting menu identity and About with existing logo, package information, repository, and support links in development and packaged builds.

Non-goals: new artwork, update checking, donations inside the application, or changing editor workflows.

## Decisions

### Keep metadata in package.json

Use name, version, and description from package.json. Add repository metadata for https://github.com/therightstuff/diffgusting and funding metadata pointing to https://industrialcuriosity.com/shop. Derive runtime display information from these fields, including the existing logo asset. Do not duplicate version or links in renderer markup.

### Set identity during desktop initialization

Set application identity early enough to affect menu construction and development startup. Audit userData path behavior before changing the runtime name; preserve existing preferences and recent comparisons if the name changes the default storage location. Packaged identity and the visible menu must agree, with the requested menu text diffgusting.

### Provide an application-owned About dialog

Use a small accessible About dialog reached from the app menu on macOS and a suitable menu on other platforms. This supports two individually clickable project links consistently across platforms, where native About options vary. Retain native app-menu actions such as Quit and Hide.

Expose display metadata through the existing host interface. Host-handled link actions open only the two package-configured HTTPS destinations in the system browser; renderer requests identify a known link rather than supply arbitrary URLs. About remains usable without network connectivity and includes the proportion-preserving logo.

## Risks / Trade-offs

- Runtime name can alter default storage paths → preserve or migrate existing settings and recents without overwriting newer data.
- A custom dialog requires accessibility work → test keyboard opening, dismissal, focus restoration, and readable metadata.
- Assets or metadata may be missing from packages → validate packaged resolution as well as development resolution.

## Migration Plan

Add metadata, wire identity and About, then verify development and packaged behavior. Preserve storage compatibility. Reverting presentation code must leave user settings and recents readable.

## Open Questions

None. Repository URL was verified from the configured origin; support URL was supplied by the user.

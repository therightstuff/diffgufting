# Application identity and About tasks

## 1. Metadata and desktop identity

- [x] 1.1 Add repository and support metadata to package.json using the verified GitHub URL and supplied shop URL; synchronize lockfile metadata where applicable.
- [x] 1.2 Initialize diffgufting application/menu identity for development and packaged launches while preserving native menu actions.
- [x] 1.3 Verify runtime-name effects on userData and preserve existing preferences and recent comparisons if storage resolution changes.

## 2. About presentation

- [x] 2.1 Expose package-derived name, version, description, logo, repository, and support information through the host interface.
- [x] 2.2 Implement accessible About presentation and menu entry points on supported desktop platforms.
- [x] 2.3 Add host-handled browser opening for the two configured links and retain editor navigation isolation.

## 3. Verification and documentation

- [x] 3.1 Verify menu naming, metadata derivation, logo resolution, keyboard dismissal/focus restoration, and both link destinations.
- [x] 3.2 Verify packaged and development asset/metadata resolution and settings/recents compatibility; record platform coverage and unavailable checks.
- [x] 3.3 Update README.md and docs/spec.md to reflect any user-facing or architectural changes introduced by this change.

# Device theme design

## Context

Preferences currently store `theme: 'dark'` or `'light'`, and the renderer applies that value directly to the root data attribute. The installed Electron API provides `nativeTheme.themeSource`, `shouldUseDarkColors`, and theme update events. The renderer must remain portable and access platform behavior through the host.

## Goals / Non-Goals

Goals: a persistent Device choice, immediate OS appearance updates, and unchanged document state and semantic colors.

Non-goals: modifying OS settings, adding theme palettes, changing the existing default, or coupling this work to source loading or undo.

## Decisions

### Separate preference from resolved appearance

Store `theme` as `dark`, `light`, or `system`; label `system` as Device in the UI. Resolve it to light/dark in the desktop host and expose the result separately in bootstrap and appearance events. The selector reflects the stored mode; the root data attribute always receives a concrete light/dark value.

Keeping resolution in the host avoids importing Electron into the renderer and makes OS transitions easy to simulate in renderer tests. A CSS-only media query would not coordinate native dialogs and the application preference as directly.

### Subscribe once and initialize before showing the window

Set Electron's application theme source from the stored mode, resolve current appearance, and set window background before display. Subscribe to native theme updates and publish the resolved appearance when needed. Update renderer tokens without remounting editors. Explicit Light/Dark choices remain fixed as the OS changes. Preference updates return both selected mode and resolved appearance, including rapid changes during startup. Remove listeners at shutdown.

### Preserve existing choices

Keep the current dark default and saved Light/Dark values. Validate the theme enum; fall back to the existing default for unsupported stored values with the established preference diagnostic. Store only the chosen mode, never a resolved OS snapshot. Device selection survives restart and resolves against the device's current appearance.

## Risks / Trade-offs

- A startup race can flash the wrong theme → resolve before window display and include appearance in bootstrap.
- Native event ordering can overwrite explicit choices → derive each update from the current preference and cover rapid switching.
- Device behavior varies by platform → exercise host event logic and include a manual native appearance smoke check on supported platforms when available.

## Migration Plan

Add the supported enum value and host appearance contract, then the selector and renderer handling. Existing preferences require no migration. Before running an older version, users can select explicit Light or Dark; that restores a preference the older renderer understands.

## Open Questions

None.

# Changelog

All notable changes to the D&D Campaign Hub plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-02-01

### Added
- **Faction Creation Modal**: Comprehensive faction builder with detailed form fields
  - Main Goal: Define the faction's primary objective
  - Pursuit Method: Describe how the faction achieves its goals
  - Leader information (optional)
  - Size & Influence metrics
  - Resources controlled by the faction
  - Reputation tracking
  - Territory management
  - Allied and enemy factions
  - Active problems/conflicts
- **Create Faction Command**: New command palette option "Create New Faction"
- Faction creation now follows the same pattern as NPC and PC creation with a guided modal form

### Changed
- Updated faction creation logic from simple name prompt to comprehensive modal form
- Improved faction template integration with frontmatter population

## [0.1.1] - 2026-01-XX

### Fixed
- Minor bug fixes and stability improvements

## [0.1.0] - 2026-01-XX

### Added
- Initial release
- Campaign initialization and structure creation
- NPC creation with modal form
- PC creation with modal form and stat tracking
- Session creation with calendar integration
- Template system for campaigns, NPCs, PCs, sessions
- Update mechanism with automatic backups
- Dependency checking for required plugins (Dataview, Calendarium, Buttons, Templater)
- Quick action modal for campaign management
- Multiple campaign support

[0.2.0]: https://github.com/kevinmumenthaler/dnd-campaign-hub/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/kevinmumenthaler/dnd-campaign-hub/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/kevinmumenthaler/dnd-campaign-hub/releases/tag/v0.1.0

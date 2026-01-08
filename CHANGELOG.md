# Changelog

All notable changes to PRISM will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Application version changelog system with admin UI
- GitHub Releases integration via edge function
- CHANGELOG.md auto-generation from database

## [1.0.0] - 2026-01-08

### Added
- Dynamic tax rules engine synchronized across all components
- Code change proposal system for regulatory updates
- Real-time profile-compliance sync triggers
- Comprehensive admin panel with collapsible sidebar
- Tax Calendar with database-driven deadlines
- Education Center with dynamic content
- NLU testing and VAT testing interfaces
- ML Health monitoring dashboard
- Pattern management for transaction classification
- Document processing skill with Nigerian bank support
- WhatsApp and Telegram chatbot integration
- Mono bank connection for transaction sync
- CBN exchange rate fetching service

### Changed
- Tax calculations now use compliance_rules table
- User profiles linked to dynamic tax categories
- Education articles sourced from database

### Fixed
- Reports.tsx VAT calculation syntax error
- RLS policies for admin-only tables

### Security
- RLS enabled on all new tables
- Admin-only access for compliance management

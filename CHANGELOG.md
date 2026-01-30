# Changelog

All notable changes to PRISM will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-01-17

Major AI enhancements with fact-grounded responses and automated code change proposals.

### Added

- Fact-grounded AI responses with source citations (chatbot)
  AI responses now include references to official FIRS documents and tax laws
- Automated code change proposals from compliance rules (admin)
  System generates code updates when tax rules change
- Legal document processing pipeline (edge-functions)
  Automatic extraction of tax rules from government documents

### Changed

- Enhanced tax calculation accuracy (api)
  Improved VAT and income tax calculations based on latest FIRS guidelines

### Fixed

- Receipt OCR edge cases (edge-functions)
  Better handling of handwritten and faded receipts

## [1.0.0] - 2026-01-08

The first public release of PRISM Tax Assistant.

### Added

- WhatsApp and Telegram chatbot integration (chatbot)
  Users can interact with PRISM via messaging platforms
- Receipt OCR processing (edge-functions)
  Automatic extraction of data from uploaded receipts
- VAT calculation engine (api)
  Accurate Nigerian VAT calculations with exemptions
- Bank statement processing (web)
  Upload and categorize bank transactions
- Admin dashboard (admin)
  Manage users, businesses, and system settings
- Tax filing reminders (edge-functions)
  Automated reminders for upcoming tax deadlines


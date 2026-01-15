import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Nigeria Tax Act 2025 - 10 Parts Content
const NIGERIA_TAX_ACT_PARTS = [
  {
    partNumber: 1,
    title: "Overview & Objectives",
    content: `# Nigeria Tax Act 2025 - Part 1: Overview & Objectives

## CHAPTER ONE - OBJECTIVE AND APPLICATION

### Section 1 - Objective
The objective of this Act is to establish unified fiscal legislation for the imposition and administration of tax in Nigeria.

### Section 2 - Application
This Act applies throughout Nigeria to all individuals and entities subject to tax laws.

## KEY DEFINITIONS (Section 202)

- **"Nigeria":** Federal Republic of Nigeria
- **"Person":** Individual, company, partnership, body of persons corporate or unincorporate
- **"Tax":** Any tax imposed under this Act
- **"Year of assessment":** Calendar year (1 January to 31 December)
- **"Resident company":** Company incorporated in Nigeria OR management/control in Nigeria
- **"Small company":** Turnover ≤N50 million AND total fixed assets ≤N250 million

## ACTS REPEALED (Section 198)

The following enactments are repealed upon commencement:
1. Companies Income Tax Act (CITA)
2. Personal Income Tax Act (PITA)
3. Tertiary Education Trust Fund (Establishment, etc.) Act
4. National Agency for Science and Engineering Infrastructure Act
5. National Information Technology Development Agency Act
6. Value Added Tax Act
7. Capital Gains Tax Act
8. Stamp Duties Act
9. Petroleum Profits Tax Act
10. Deep Offshore and Inland Basin Production Sharing Contracts Act
11. Nigeria Oil and Gas Industry Content Development Act (fiscal incentive provisions)

## STRUCTURE OF THE ACT

**Nine Chapters:**
1. **Chapter 1:** Objective and Application
2. **Chapter 2:** Taxation of Income (Individuals & Companies)
3. **Chapter 3:** Taxation of Petroleum Operations
4. **Chapter 4:** Taxation of Cross-border Transactions
5. **Chapter 5:** Taxation of Gains from Disposal of Chargeable Assets
6. **Chapter 6:** Value Added Tax
7. **Chapter 7:** Surcharge on Fossil Fuels
8. **Chapter 8:** Stamp Duties
9. **Chapter 9:** General Provisions

**Commencement:** 1 January 2026`
  },
  {
    partNumber: 2,
    title: "Income Tax (Individuals)",
    content: `# Nigeria Tax Act 2025 - Part 2: Income Tax (Individuals)

## CHAPTER TWO – TAXATION OF INCOME OF PERSONS

### PART I – IMPOSITION OF TAX

**Section 3 - Imposition of tax**  
Income tax shall be imposed on:
- (a) Profits or gains of any company or enterprise
- (b) Income of any individual or family
- (c) Income arising to a trustee or an estate

---

### PART II – TAXATION OF RESIDENT PERSONS

**Section 12 - Resident Individual**  
The income, gains or profits of an individual who is a resident of Nigeria are deemed to accrue in Nigeria and are chargeable to tax in Nigeria wherever they arise.

**Section 13 - Employment Income**  
Income from employment is derived from Nigeria where:
- (a) The employee is a resident of Nigeria; OR
- (b) The duties are wholly or partly performed in Nigeria and remuneration is:
  - Paid by a resident employer, OR
  - Borne by a Nigerian permanent establishment, OR
  - Not liable to tax in employee's country of residence

**Section 14 - Benefits-in-Kind**  
- 5% annual benefit on assets provided by employer
- Accommodation benefit capped at 20% of annual gross income (excluding rental value)

---

### PART VII – ASCERTAINMENT OF TOTAL INCOME OF AN INDIVIDUAL

**Section 28 - Total Income of an Individual**  
Total income = Taxable income less total deductions

Taxable income includes:
1. Assessable profits from trade/business/profession
2. Employment income
3. Income from investing activities
4. Profits from any other source
5. Chargeable gains from disposal of assets

Total deductions include:
1. Losses
2. Capital allowances
3. Tax-exempt income
4. Income on which tax deducted at source is final

---

### PART VIII – CHARGEABLE INCOME

**Section 30 - Ascertainment of Chargeable Income**  
Chargeable income = Total income less eligible deductions

**Eligible deductions:**
- National Housing Fund contributions
- National Health Insurance Scheme contributions
- Pension Reform Act contributions
- Interest on loans for owner-occupied residential house
- Life insurance premiums (for self or spouse)
- Rent relief: 20% of annual rent paid, maximum N500,000

---

### PART IX – RATES OF TAX

**Section 58 - Rates of Tax for Individuals** (Fourth Schedule)

| Chargeable Income | Rate |
|-------------------|------|
| First N800,000 | 0% |
| Next N2,200,000 | 15% |
| Next N9,000,000 | 18% |
| Next N13,000,000 | 21% |
| Next N25,000,000 | 23% |
| Above N50,000,000 | 25% |

**Note:** Individuals earning only the National Minimum Wage or less are exempt from income tax.

---

## KEY EXEMPTIONS FOR INDIVIDUALS (Section 163)

**Fully Exempt:**
- Pension, gratuity or retirement benefits under Pension Reform Act
- Wound and disability pensions for armed forces
- Death gratuities and compensation
- Employment income of military officers (wages and salaries)
- Income from employment earning minimum wage or less
- Income equal to or below minimum wage

**Partially Exempt:**
- Compensation for personal injury: First N50,000,000 exempt
- Redundancy payments (subject to Part VIII rules)

---

## PRINCIPAL PRIVATE RESIDENCE EXEMPTION (Section 51)

Gains from disposal of:
- A dwelling-house (or part thereof)
- Land adjoining the dwelling (up to 1 acre maximum)

**Conditions:**
- Exemption enjoyed only ONCE in lifetime
- Must be used as principal residence
- Land must not be used for commercial purposes

---

## PERSONAL CHATTELS (Section 52)

Disposal of personal movable property exempt if:
- Total consideration doesn't exceed N5,000,000 OR
- Three times annual national minimum wage (whichever is higher)
- Per year of assessment

**Motor Vehicles (Section 53):**
- Vehicles used solely for private/non-profit purposes: exempt
- Limited to TWO vehicles per individual per year

---

## RELIEF FOR DOUBLE TAXATION (Chapter 4)

**Section 120 - Unilateral Relief**  
Foreign tax credit allowed as lower of:
- Nigerian tax attributable to foreign income, OR
- Actual tax paid in source country

**Section 121 - Double Taxation Agreements**  
Tax treaties must be ratified by National Assembly to take effect.`
  },
  {
    partNumber: 3,
    title: "Companies Income Tax",
    content: `# Nigeria Tax Act 2025 - Part 3: Companies Income Tax

## CHAPTER TWO – TAXATION OF INCOME (COMPANIES)

### TAXATION OF NIGERIAN COMPANIES

**Scope:**
- Worldwide income of Nigerian resident companies is taxable
- Controlled Foreign Company (CFC) rules apply to undistributed profits of foreign subsidiaries (Section 6)

---

### ASCERTAINMENT OF TOTAL PROFITS

**Section 29 - Total Profits of a Company**  
Formula: Total Profits = Assessable Profits − Losses − Capital Allowances

**Losses:**
- Deduct from same source income first
- Carry forward excess indefinitely
- Prior year losses deducted before current year allowances

---

### RATES OF TAX FOR COMPANIES (Section 56)

| Category | Rate |
|----------|------|
| Small Company (≤N50M turnover AND ≤N250M assets) | 0% |
| Other Companies | 30% |

**Minimum Effective Tax Rate (Section 57):**
- 15% minimum for MNE groups and large companies (≥€750M revenue)
- Top-up tax applies if effective rate falls below 15%

---

### DEVELOPMENT LEVY (Section 59)

**Rate:** 4% of assessable profits

**Applies to:**
- All companies EXCEPT small companies and non-resident companies without PE

**Distribution:**
- 50% to Tertiary Education Trust Fund
- 25% to National Agency for Science and Engineering Infrastructure
- 15% to National Information Technology Development Agency
- 10% to Defence and Security Fund

---

### DEDUCTIONS ALLOWED (Section 20)

**Fully Deductible:**
- Interest on capital (subject to 30% EBITDA limit for connected persons)
- Rent on premises
- Salaries and wages
- Repairs of premises, fixtures, plant, machinery
- Bad debts (proven)
- Approved pension contributions
- Contribution to an accredited body for funding of a research paper (up to 10% of assessable profit)
- Wear and tear allowances

---

### DEDUCTIONS NOT ALLOWED (Section 21)

**Non-Deductible:**
- Capital expenditure (except as specifically allowed)
- Private or domestic expenses
- Taxes on income or profits
- Rent payments to connected persons in excess of market rate
- Unapproved pension contributions
- Expenses where VAT not charged (if applicable)
- Expenses where import duty not paid (if applicable)

---

### CAPITAL ALLOWANCES (First Schedule Part I)

**Three Classes:**

| Class | Rate | Assets |
|-------|------|--------|
| 1 | 10% | Buildings, Agricultural assets, Masts, Intangible assets, Heavy transport |
| 2 | 20% | Plant & equipment, Furniture & fittings, Mining equipment |
| 3 | 25% | Motor vehicles, Software, Other capital expenditure |

**Key Rules:**
- Straight-line depreciation
- Asset must be in use at end of basis period
- Unutilized allowances carried forward
- VAT and import duty must have been paid for asset to qualify

---

### DIVIDEND SUBSTITUTION (Section 61)

- Dividends from Nigerian companies to resident shareholders are not exempt unless:
  - Paid out of profits already taxed in Nigeria
  - Recipient is also a Nigerian company (to prevent double taxation)

---

### UNDISTRIBUTED PROFITS OF CLOSE COMPANIES (Section 63)

- Service may direct distribution of unreasonable accumulated profits
- Company may be treated as having distributed such profits

---

### NON-RESIDENT COMPANIES (Sections 17-18)

**Taxable in Nigeria if:**
- Has a permanent establishment (PE) in Nigeria
- Derives income from Nigeria through a PE
- Has significant economic presence in Nigeria (Section 18)

**Significant Economic Presence:**
- Annual revenue from Nigeria ≥N25 million for services
- Annual revenue from Nigeria ≥N50 million for goods sales
- Using Nigerian domain name or IP
- Having systematic relationship with Nigerian customers

---

### TRANSFER PRICING (Section 192)

**Arm's Length Principle:**
- Transactions between related parties must be at arm's length
- Service may adjust prices if not at arm's length
- Documentation requirements apply

**Section 191 - Artificial Transactions:**
- Service may disregard transactions that are artificial or fictitious
- May adjust income where tax avoidance is the purpose`
  },
  {
    partNumber: 4,
    title: "Value Added Tax",
    content: `# Nigeria Tax Act 2025 - Part 4: Value Added Tax (VAT)

## CHAPTER SIX – VALUE ADDED TAX

### Section 144 - Imposition of VAT
Value Added Tax (VAT) is imposed in accordance with Chapter Six.

### Section 145 - Charge of VAT
VAT shall be paid on all taxable supplies in Nigeria (subject to exemptions).

### Section 148 - Rate of VAT
**Standard Rate: 7.5%**

---

## TAXABLE SUPPLIES (Section 146)

A supply is taxable in Nigeria where:

### Goods:
- Physically present, imported, assembled or installed in Nigeria, OR
- Beneficial owner is Nigerian and goods/rights situated in Nigeria

### Services:
- Provided to and consumed by a person in Nigeria (regardless where rendered), OR
- Connected with immovable property located in Nigeria

### Incorporeal Property:
- Exploited by person in Nigeria, OR
- Registered in Nigeria or assigned to Nigerian person, OR
- Connected with tangible/immovable asset in Nigeria

---

## TIME OF SUPPLY (Section 147)

VAT due when **first** of these occurs:
1. Invoice/receipt issued
2. Goods delivered or made available
3. Payment due or received

**Special Rules:**
- **Rental/periodic payments:** Each payment treated as separate supply
- **Progressive supplies:** Deemed successive supplies when payments due
- **Instalment credit:** Supply occurs at delivery or first payment

---

## EXEMPT SUPPLIES (Section 186)

**Fully Exempt from VAT:**
1. Oil and gas exports
2. Crude petroleum and feed gas
3. Humanitarian donor-funded goods
4. Baby products
5. Locally manufactured sanitary products
6. Military hardware, arms, ammunition
7. Shared passenger road transport
8. Agricultural tractors and equipment
9. Export processing/free trade zone supplies (for approved activities)
10. Diplomatic missions and diplomats
11. Educational plays/performances
12. Land and buildings
13. Money and securities
14. Government licenses
15. Assistive devices for disabilities

---

## ZERO-RATED SUPPLIES (Section 187 & Thirteenth Schedule)

**Charged at 0% (input VAT recoverable):**

### Food Items:
- Basic food items (cereals, flour, fish, fruits, vegetables, etc.)
- Locally produced table honey
- White and brown bread
- Cooking oils (for culinary use)
- Salt (for culinary use only)
- Water (excluding sparkling/flavored, restaurant sales)

### Agriculture:
- Fertilizers
- Locally produced agricultural chemicals
- Locally produced veterinary medicine
- Locally produced animal feeds
- Live cattle, goats, sheep, poultry
- Agricultural seeds and seedlings

### Medical:
- All medical and pharmaceutical products
- Medical services
- Medical equipment

### Education:
- Educational books and materials
- Tuition (nursery, primary, secondary, tertiary)

### Other:
- Electricity (generation to grid, transmission to DISCOs)
- Exported goods (excluding oil and gas)
- Exported services
- Exported incorporeal property
- Electric vehicles and assembly parts

---

## SUSPENDED ITEMS (Eleventh Schedule)

**VAT Collection Suspended** (Minister may activate by Order):
- Petroleum products (automotive gas oil, aviation fuel, premium motor spirit, kerosene, LPG)
- Renewable energy equipment
- Compressed Natural Gas (CNG)
- Liquefied Petroleum Gas (LPG)
- Other gaseous hydrocarbons

---

## VALUE OF TAXABLE SUPPLY (Section 149)

**For Money Consideration:**
Value = Amount that with VAT equals consideration

**Not for Money:**
Value = Market value

**Imported Goods (Section 150):**
Value = Price + taxes/duties + costs (commission, transport, insurance to port)

---

## NON-RESIDENT SUPPLIERS (Section 151)

**Rules for Non-Residents Making Taxable Supplies to Nigeria:**

1. Must register and charge VAT
2. **If from outside Nigeria:** Nigerian recipient must withhold VAT
3. **Service may appoint non-resident to collect** (e.g., digital platforms)
4. Non-resident may appoint Nigerian representative
5. **Online imports:** If VAT collected at border, no further VAT at clearing

---

## INPUT TAX CREDIT (Section 156)

### Monthly Reconciliation:
- **Output VAT > Input VAT:** Remit excess to Service
- **Input VAT > Output VAT:** Carry forward as credit OR request refund

### Credit Requirements:
- Input tax must relate to taxable supplies
- **Mixed use:** Only proportion for taxable supplies deductible
- **Time limit:** Claim within 5 years of incurring input tax

### Refund Eligibility:
- Zero-rated suppliers (0% output, but pay input VAT)
- Unutilized credits (upon request with documentation)

---

## COLLECTION & REMITTANCE

### Section 154 - Collection by Taxable Person
Taxable person must collect VAT at 7.5% on taxable supplies made.

### Section 155 - Collection by Others
**Must collect/withhold VAT:**
- Federal, State, Local Government MDAs
- Persons appointed by Service

**Remittance:**
- By 14th day of following month
- With schedule showing: name, Tax ID, address, invoice number, amounts

### Section 153 - VAT Invoice Requirements
Must contain:
1. Supplier's Tax ID
2. Invoice number (sequential)
3. Name and address of supplier
4. Business registration number
5. Date of supply
6. Name of purchaser
7. Gross amount
8. VAT charged and rate

---

## FISCALIZATION (Section 158)

Service may require taxable persons to implement fiscalization systems:
- Electronic devices
- Software solutions
- Secured communication networks
- Electronic invoicing and data transfer

---

## PENALTIES & COMPLIANCE

**Key Obligations:**
- Register if turnover exceeds threshold
- Issue VAT invoices
- Collect VAT on taxable supplies
- File monthly returns
- Remit VAT by due date
- Maintain proper records

**Non-Compliance:**
- Penalties per Nigeria Tax Administration Act 2025
- Interest on late payment
- Prosecution for serious violations

---

## SPECIAL RULES

### Section 157 - Business Transfer
VAT rules for business restructuring follow Section 190 provisions.

### Import Duty Rule (Sections 21 & 156)
**Critical:** Expenses where VAT or import duty not paid are:
- NOT deductible for income tax
- NOT eligible for capital allowances
- NOT creditable as input VAT

---

## PRACTICAL EXAMPLES

### Example 1: Standard Taxable Supply
- Sale of furniture: N100,000
- VAT @ 7.5%: N7,500
- **Total invoice: N107,500**
- Supplier collects N7,500 and remits to Service

### Example 2: Zero-Rated Supply
- Sale of rice (basic food): N50,000
- VAT @ 0%: N0
- **Total invoice: N50,000**
- Seller can claim refund of input VAT paid on purchases

### Example 3: Exempt Supply
- Rent of office building: N500,000
- VAT: Not applicable (exempt)
- **Total: N500,000**
- Landlord cannot claim input VAT on building costs`
  },
  {
    partNumber: 5,
    title: "Stamp Duties",
    content: `# Nigeria Tax Act 2025 - Part 5: Stamp Duties

## CHAPTER EIGHT – STAMP DUTIES

### Section 128 - Charge of Duties

**Stamp duties shall be charged on certain instruments executed in Nigeria.**

**Instruments subject to duty:**
- Written documents evidencing transactions
- As specified in the Ninth Schedule

---

## METHODS OF STAMPING

### Section 129 - Methods

**(a) Impressed Stamps:**
- Adhesive stamps affixed to instrument
- Impressed by Service using official dies

**(b) E-stamps:**
- Electronic stamps generated by Service
- Unique reference number per instrument

---

## WHO PAYS THE DUTY

### Section 130 - Liability for Duty

**Primary Liability:**

| Instrument Type | Person Liable |
|-----------------|---------------|
| Conveyance | Transferee (buyer) |
| Lease | Lessee (tenant) |
| Share Transfer | Transferee |
| Mortgage | Mortgagor (borrower) |
| Bond | Obligor |
| Other Instruments | Parties as specified in Schedule |

**Joint and Several Liability:**
All parties to an instrument may be jointly liable if duty unpaid.

---

## TIME FOR STAMPING

### Section 131 - Time Limits

**Within Nigeria:**
- **30 days** from execution

**Outside Nigeria:**
- **30 days** from first receipt in Nigeria

**Electronic Instruments:**
- Before or at time of execution

---

## ADMISSIBILITY IN EVIDENCE

### Section 135 - Inadmissibility of Unstamped Instruments

**Unstamped instruments are NOT:**
- Admissible as evidence in court
- Valid for registration purposes
- Enforceable in any proceeding

**Exception:**
- Criminal proceedings where instrument is evidence of crime
- By order of court upon payment of duty + penalty

---

## CHARGEABLE INSTRUMENTS

### Bills of Exchange (Section 136)

**Foreign Bills:**
- Per amount of the bill

**Inland Bills:**
- Per amount of the bill

### Promissory Notes

- Per face value amount

### Options (Section 139)

**Ad valorem duty on:**
- Call options: Amount payable on exercise
- Put options: Amount receivable on exercise
- First option or extension granted

### Conveyances on Sale (Section 140)

**Property Transfers:**
- Ad valorem on consideration
- Higher of consideration or market value

**Exempt if:**
- Transfer to spouse
- Transfer between parent and child
- Government acquisitions for public purposes

### Leases (Section 141)

**Duty based on:**
- Term of lease
- Annual rent

**Exempt if:**
- Annual rental value < N10,000,000, OR
- Annual rental value < 10× National Minimum Wage

### Company Instruments (Section 136-137)

**Share Capital:**
- Ad valorem on nominal capital
- Applies to: incorporation, increase of capital

**Loan Capital:**
- Ad valorem on debentures, stock, funded debt
- Excludes: short-term debt (≤12 months), overdrafts, bank on-lending

---

## ELECTRONIC TRANSACTIONS (Section 143)

**Electronic Receipts:**
- N50 per transaction receipt
- Collected by financial institutions
- Remitted to Service

**Exemptions:**
- Transactions between same person's accounts
- Government transactions
- Educational institution transactions
- Transfers to cooperative societies
- Charitable organizations

---

## SPECIAL PROVISIONS

### Section 133 - Exemptions

**Instruments Exempt from Duty:**
- Government securities and transfers
- Co-operative society instruments
- Building society instruments
- Religious body instruments (for worship)
- Educational institution instruments
- Charitable organization instruments
- Loan agreements with Nigerian banks (under certain conditions)

### Section 142 - Petroleum Merger Exemption

**No stamp duty on:**
- Asset segregation for upstream companies converting under PIA
- Transfers incident to petroleum license conversion

---

## ADMINISTRATION

### Section 134 - Powers of Service

**Service may:**
- Assess stamp duty payable
- Inspect instruments
- Require production of instruments
- Impose penalties for late stamping
- Compound offenses

**Penalties:**
- Late stamping: Penalty up to 5× duty payable
- Fraudulent stamping: Criminal prosecution

---

## COMPLIANCE SUMMARY

| Requirement | Standard | Consequence of Non-Compliance |
|-------------|----------|-------------------------------|
| Stamp within 30 days | Mandatory | Penalty + duty |
| Use correct method | Required | Inadmissibility |
| Pay full duty | Required | Legal invalidity |
| E-stamp where required | Mandatory | Rejection |

---

## PRACTICAL EXAMPLES

### Example 1: Property Sale

**Facts:**
- Sale price: N50,000,000
- Market value: N55,000,000

**Duty:**
- Based on N55,000,000 (higher value)
- Ad valorem rate per Ninth Schedule
- Payable by buyer within 30 days

### Example 2: Lease Agreement

**Facts:**
- Annual rent: N5,000,000
- Term: 5 years

**Duty:**
- **EXEMPT** (annual rent < N10,000,000)

### Example 3: Share Capital Increase

**Facts:**
- Company increases share capital by N100,000,000

**Duty:**
- Ad valorem on N100,000,000
- Per Ninth Schedule rate
- Payable before registration

### Example 4: Loan Capital

**Facts:**
- Company issues N500,000,000 debentures

**Duty:**
- Ad valorem on N500,000,000
- Per Ninth Schedule rate
- Excludes short-term loans`
  },
  {
    partNumber: 6,
    title: "Tax Incentives",
    content: `# Nigeria Tax Act 2025 - Part 6: Tax Incentives

## INCOME TAX EXEMPTIONS (Section 163)

### Fully Exempt Entities/Income:

1. **Friendly Societies:** Surplus funds
2. **Co-operative Societies:** Profits from activities with members
3. **Charitable Organizations:** Income used wholly for charitable purposes
4. **Government Bodies:** Statutory corporations, local authorities
5. **Investment Income:** 
   - Dividends from unit trusts
   - Interest on government securities (bonds, treasury bills)
6. **Foreign Income (Section 10):**
   - Dividends, interest, royalties remitted through approved channels
   - Only for individuals

---

### Personal Income Exemptions:

1. **Minimum Wage Exemption:**
   - Individuals earning ONLY national minimum wage or less
   - Complete exemption from income tax

2. **Retirement Benefits:**
   - Pensions under Pension Reform Act
   - Gratuities and lump sum payments

3. **Compensation:**
   - First N50,000,000 of personal injury compensation

4. **Startup Gains:**
   - Capital gains from disposal of qualifying investments in Nigerian startups (conditions apply)

---

## SPECIFIC DEDUCTIONS & RELIEFS

### Wage Relief (Section 163(3))

**50% Additional Deduction for:**
- Wage awards to low-income workers
- Net new employment costs (2023-2025)

**Purpose:** Encourage employment and wage increases

---

### Deductible Donations (Section 164)

**Donations to:**
- Public institutions
- Established bodies for public benefit
- Tertiary education institutions
- Science and research institutions

**Limit:** 10% of profit before tax (not cumulative with R&D)

---

### Research & Development (Section 165)

**Deductible R&D:**
- Expenditure on approved R&D activities
- Connected with taxpayer's business

**Limit:** 5% of turnover

---

## ECONOMIC DEVELOPMENT TAX INCENTIVE (EDTI)

### Sections 166-184

**Replaces:** Old Pioneer Status regime

**Purpose:** Incentivize investment in priority sectors

---

### Priority Sectors (Tenth Schedule)

**Examples:**
- Manufacturing (various subsectors)
- Agriculture and agro-processing
- Information & communication technology
- Tourism and hospitality
- Creative industries
- Solid minerals processing
- Renewable energy
- Healthcare services
- Education services

---

### Eligibility Criteria

**To Qualify:**
1. Engage in priority sector activity
2. Meet minimum capital investment threshold
3. Not already enjoying other incentives
4. Apply through NIPC within specified period
5. Sector not past sunset date

---

### Application Process

**Step 1:** Apply to Nigerian Investment Promotion Commission (NIPC)

**Step 2:** NIPC evaluates against criteria

**Step 3:** NIPC recommends to President

**Step 4:** President approves or rejects

**Step 5:** Certificate issued specifying:
- Incentive period
- Tax credit rate
- Products/activities covered

---

### The Incentive: Economic Development Tax Credit (EDTC)

**Nature:** Tax credit against income tax payable

**Rate:** As specified in certificate (varies by sector)

**Period:** Up to 5 years (may be extended once)

**Calculation:**
Taxable income × EDTC rate = Tax credit
Tax payable − Tax credit = Net tax payable

**If Credit > Tax:**
Excess carried forward (up to 3 years)

---

### Key Conditions

**During Incentive Period:**
1. Maintain qualifying activity
2. Submit annual reports to NIPC
3. Allow NIPC inspections
4. Comply with all statutory obligations
5. Not claim other tax incentives on same income

---

### Cancellation/Withdrawal

**NIPC may cancel if:**
- False information in application
- Failure to maintain qualifying activity
- Failure to meet reporting requirements
- Other material breach of conditions

**Effect of Cancellation:**
- Tax credit recaptured for all years
- Interest charged on recaptured amounts
- Possible penalties

---

### Important Limitations

**Cannot Combine With:**
- Other sector-specific incentives
- Double deduction claims
- Transfer pricing adjustments that reduce income

**Subject to:**
- Minimum Effective Tax Rate (Section 57) for large companies
- Anti-avoidance rules (Section 191)

---

## PRACTICAL EXAMPLE

**Company X - Manufacturing**

**Facts:**
- Approved EDTI for textile manufacturing
- EDTC rate: 35%
- Year 1 taxable income: N100,000,000
- Normal tax rate: 30%

**Calculation:**

**Without EDTI:**
- Tax @ 30%: N30,000,000

**With EDTI:**
- Tax @ 30%: N30,000,000
- Less: EDTC (35% × N100M): N35,000,000
- Tax payable: N0
- Credit carried forward: N5,000,000

---

## EXPORT PROCESSING ZONES (Second Schedule)

### Section 60 - Tax Treatment

**100% Export Operations:**
- Full income tax exemption
- Subject to Section 57 minimum ETR for large companies

**≤25% Domestic Sales:**
- Still qualifies for exemption

**>25% Domestic Sales:**
- Tax on ALL customs territory sales

**From 1 January 2028:**
- All customs territory sales taxed
- President may extend phase-in (max 10 years)`
  },
  {
    partNumber: 7,
    title: "Anti-Avoidance & General Provisions",
    content: `# Nigeria Tax Act 2025 - Part 7: Anti-Avoidance & General Provisions

## CHAPTER NINE – GENERAL PROVISIONS

---

## SECTION 190 – BUSINESS RESTRUCTURING

### (a) MERGER

**Rules:**
- **No deemed cessation** of merged businesses
- **No disposal** for chargeable gains purposes
- **Assets transferred at residue** (book value)
- **Capital allowances:** Continue on remaining useful life
- **Unutilized capital allowances:** Available to surviving entity
- **Unabsorbed losses:** Available to surviving entity (if from merged business)
- **Taxes deducted at source:** Available to merged business

### (b) SALE/TRANSFER WITH CESSATION

**Rules:**
- **Cessation provisions apply** (Section 24)
- **Assets recognized at sale/transfer value**
- **Chargeable gains rules apply**
- **Unutilized capital allowances:** NOT available to new business
- **Unabsorbed losses:** NOT available to new business
- **Taxes deducted at source:** NOT available to new business

### (c) ASSET SALE WITHOUT CESSATION (at ≤ residue + unutilized CA)

**Rules:**
- **Capital allowances:** On residue only
- **Unutilized capital allowances:** Transfer to buyer
- **Seller:** Cannot claim transferred unutilized CA
- **No chargeable gains** on transferred asset

### VAT Treatment
**No VAT** on restructuring if:
- Business transferred as going concern
- Purchaser uses assets in same business
- Purchaser registered or registerable

### Notification Required
Tax authority must be notified BEFORE restructuring

---

## SECTION 191 – ARTIFICIAL TRANSACTIONS

**Power of Tax Authority:**
May **disregard or adjust** if:
- Disposition not given effect, OR
- Transaction is artificial or fictitious, OR
- Transaction reduces tax

**Presumption:**
Connected person transactions presumed artificial unless arm's length

**Appeal Rights:** Full objection/appeal rights apply

---

## SECTION 192 – TRANSFER PRICING

### Requirements:
1. **Related party arrangements must be at arm's length**
2. **Report arrangements** to tax authority (form/manner prescribed)

### Tax Authority Powers:
- **Adjust prices** if not arm's length
- **Issue regulations** for administration

### Definitions:
- **"Arrangement":** Any agreement, transaction, scheme, financial/commercial relation
- **"Arm's length":** Terms between unrelated parties in comparable circumstances

---

## SECTION 193 – WAIVER/REFUND OF LIABILITY

### Income Treatment:
**Waiver/release/refund** of liability or expense = income on waiver date

### Capital Treatment:
**Capital liability waived** = chargeable gain (Part VIII, Chapter 2)

---

## SECTION 200 – EXERCISE OF POWERS

**General Compliance:**
Powers, duties, obligations exercised per **Nigeria Tax Administration Act 2025**

---

## SECTION 201 – CONFLICT WITH OTHER LAWS

### Supremacy:
**Nigeria Tax Act 2025 prevails** over other laws regarding:
- Tax imposition
- Royalty
- Levy
- Surcharge

### Key Rules:
1. **Taxable income, deductions, reliefs:** Determined ONLY per this Act
2. **No double taxation:** Same tax base not taxed twice
3. **Ministerial regulations** for implementation

### Government Agencies:
Must discharge duties **per this Act** for tax imposition

---

## OTHER KEY GENERAL PROVISIONS

### Section 194 – Supplemental
- Income/profits/gains include amounts taxed by deduction at source
- Apportionment must be just, equitable, consistently applied

### Section 195 – Power to Make Regulations
Service may make regulations (with Minister's approval)

### Section 199 – Savings Provisions
- **Existing actions under repealed Acts:** Continue valid
- **Subsidiary legislation:** Continues unless inconsistent
- **Pending proceedings:** Continue as if under this Act
- **Past actions:** Treated as done under this Act if continuing effect

### Section 202 – General Interpretation
Comprehensive definitions (see Part 1 artifact for key terms)

### Section 203 – Citation
**"Nigeria Tax Act, 2025"**
**Commencement:** 1 January 2026

---

## CONNECTED PERSONS (Section 202 Definition)

### Individuals:
- Married persons
- Relatives (brother, sister, ancestor, lineal descendant)

### Trusts:
- Trustee & settlor
- Trustee & settlor's spouse/relative

### Partnerships:
- Partners with each other
- Partner & partner's spouse/relative

### Companies:
- Person controls company (self, spouse, or relative)
- Same person controls both companies
- Common control by connected persons
- One company participates in management/control/capital of other (or same persons participate)

### General:
- One acts per directions of other
- Both act per directions of third party
- One controls business decisions of other

**Exception:** Employer-employee or client relationship alone insufficient

**Participation Threshold:** 30%+ of voting rights, dividends, income, or capital

---

## RELATED PARTIES (Same as Connected Persons)

**Transfer Pricing applies** to related party transactions

---

## ANTI-AVOIDANCE SUMMARY

| Provision | Mechanism | Scope |
|-----------|-----------|-------|
| **Section 191** | Disregard artificial transactions | All transactions |
| **Section 192** | Arm's length adjustment | Related parties |
| **Section 6(2)** | CFC rules | Foreign subsidiaries |
| **Section 6(3)** | Top-up tax | Foreign low-taxed subsidiaries |
| **Section 57** | Minimum effective tax rate | Large companies, MNE groups |
| **Section 17(5)-(8)** | Permanent establishment attribution | Non-residents |
| **Section 193** | Waiver as income/gain | Debt forgiveness |
| **Third Schedule** | Interest deductibility limit | Connected person debt |

---

## PRACTICAL EXAMPLES

### Example 1: Artificial Transaction

**Facts:**
- Company A sells asset to connected Company B for N1 million
- Market value: N10 million

**Tax Treatment:**
- Transaction deemed artificial
- Service adjusts consideration to N10 million
- Chargeable gain computed on N10 million
- Company may appeal adjustment

---

### Example 2: Transfer Pricing

**Facts:**
- Nigerian subsidiary pays 10% royalty to foreign parent
- Arm's length royalty: 5%

**Tax Treatment:**
- Service disallows 5% excess
- Adjusts taxable income upward
- May impose penalties per Tax Administration Act

---

### Example 3: Business Merger

**Facts:**
- Company A (N50m capital allowance, N20m loss) merges with Company B
- Assets transferred at residue N100m

**Tax Treatment:**
- No deemed cessation
- No chargeable gains on transfer
- Merged entity continues capital allowances on N100m residue
- Merged entity can use N20m loss (if from same trade)
- No VAT on merger

---

### Example 4: Debt Forgiveness

**Facts:**
- Company owes N30 million to bank
- N10 million previously deducted as interest expense
- Bank forgives N15 million

**Tax Treatment:**
- N15 million waiver = income in year of waiver
- If capital debt: N15 million = chargeable gain
- Taxable in year waiver executed

---

## COMPLIANCE CHECKLIST

### For All Transactions:
- [ ] Ensure arm's length pricing
- [ ] Document related party transactions
- [ ] Notify tax authority of restructuring
- [ ] Retain transfer pricing documentation

### For Artificial Transactions:
- [ ] Commercial rationale documented
- [ ] Market-based pricing
- [ ] Real economic substance
- [ ] Consistent with business purpose

### For Business Restructuring:
- [ ] Tax authority notification (before)
- [ ] Asset valuation documented
- [ ] Capital allowance schedules updated
- [ ] Loss carry-forward tracking
- [ ] VAT going concern relief conditions met

---

## KEY TAKEAWAYS

1. **Tax authority has broad anti-avoidance powers**
2. **Connected person transactions scrutinized**
3. **Transfer pricing compliance mandatory**
4. **Business restructuring has specific tax rules**
5. **Debt forgiveness creates taxable income**
6. **This Act overrides conflicting laws**
7. **Appeal rights preserved for adjustments**
8. **Documentation essential for defense**`
  },
  {
    partNumber: 8,
    title: "Petroleum Operations Taxation",
    content: `# Nigeria Tax Act 2025 - Part 8: Petroleum Operations Taxation

## CHAPTER THREE – TAXATION OF INCOME FROM PETROLEUM OPERATIONS

---

## OVERVIEW

**Three Tax Regimes:**

1. **Part I:** Hydrocarbon Tax (NEW - Petroleum Industry Act leases)
2. **Part II:** Petroleum Profits Tax (OLD - Pre-PIA leases not yet converted)
3. **Part III:** Deep Offshore & Inland Basin PSCs

**Plus:** All petroleum operations subject to **Chapter 2 Income Tax**

---

## PART I – HYDROCARBON TAX (Sections 65-89)

### Application (Section 65)

**Applies to:**
- Upstream petroleum operations
- Onshore, shallow water, deep offshore
- Licences/leases under Petroleum Industry Act

**Covers:**
- Crude oil
- Field condensates
- Liquid natural gas liquids from associated gas

**Excludes:**
- Associated natural gas (gaseous)
- Non-associated natural gas
- Condensates from non-associated gas
- Products downstream of measurement points

---

### Section 66 - Charge of Hydrocarbon Tax

**Levied on:** Profits from crude oil operations

**Basis:** Per accounting period (1 Jan - 31 Dec)

---

### Section 67 - Ascertainment of Profits

**Crude Oil Revenue:**
- Proceeds of all chargeable oil sold
- Value of all chargeable oil disposed

**Adjusted Profit:**
- Revenue less allowable deductions (Section 68)

**Assessable Profit:**
- Adjusted profit less losses (Section 70)

**Chargeable Profit:**
- Assessable profit less allowances (Section 71)

---

### Section 68 - Allowable Deductions

**Deductible:**
1. Rents for petroleum mining lease/prospecting licence
2. **Royalties** (crude oil, associated gas, and PSC payments)
3. Repair expenses (plant, machinery, fixtures)
4. **First exploration well + first 2 appraisal wells** (tangible/intangible)
5. **Decommissioning & abandonment fund** (approved, cash-backed)
6. Levies, stamp duties, fees to Government
7. Gas reinjection wells (ratified by Commission)
8. **Host community development trusts** (approved contributions)

**Note:** Subsequent exploration/appraisal wells = qualifying drilling expenditure (capital allowances)

---

### Section 69 - Deductions NOT Allowed

**Non-Deductible:**
1. Purchase of petroleum deposit information
2. Penalties, gas flare fees
3. Financial/bank charges, arbitration, litigation, bad debts, interest
4. Head office/affiliate costs, shared costs, R&D
5. Production/signature bonuses, licence renewal fees
6. Tax paid on behalf of vendor/contractor (net-of-tax contracts)
7. Capital withdrawn
8. Capital improvements
9. Insurance recoveries
10. Non-business premises rent/repairs
11. Income taxes, development levy, other taxes
12. Depreciation
13. Unapproved pension contributions
14. Customs duties
15. **Expenses where VAT not charged or import duty not paid**
16. Costs per Sixth Schedule para 2(2)(c)

---

### Section 72 - Chargeable Hydrocarbon Tax Rates

**TWO CLASSES:**

**(a) 30% Rate:**
- Petroleum mining leases per PIA Section 93(6)(b) & 93(7)(b)
- Onshore and shallow water

**(b) 15% Rate:**
- Onshore and shallow water
- Petroleum prospecting licences per PIA Section 93(6)(a) & 93(7)(a)

---

### Section 78 - Income Tax on Petroleum Operations

**Applies to:**
All petroleum operations (upstream, midstream, downstream) under PIA

**Income Tax Includes:**
- All incidental income from petroleum operations
- Chargeable gains on asset disposal

**Key Rules:**
- **Hydrocarbon tax NOT deductible** for income tax
- Royalties deductible per Section 82
- Decommissioning/abandonment funds deductible per Section 82
- Host community development trust contributions deductible

---

### Section 79 - Separate Companies Required

**Rule:**
Separate company for each stream:
- Upstream
- Midstream  
- Downstream

**Exception - Integrated Strategic Projects (ISP):**
- Oil & gas produced for processing to finished products
- Supplied wholesale solely to domestic market
- Can consolidate upstream + midstream for tax
- Arm's length transfer prices required

---

## PART II – PETROLEUM PROFITS TAX (Sections 90-101)

### Application (Section 90)

**Applies to:**
- Oil prospecting licences (OPLs)
- Oil mining leases (OMLs)
- **NOT yet converted** under Petroleum Industry Act

**Tax:** Petroleum profits tax on profits per accounting period

---

### Section 99 - Assessable Tax Rate

**Standard Rate:** 85% of chargeable profits

**Reduced Rate (Pre-Production):**
- 65.75% of chargeable profits
- Applies before full amortisation of pre-production costs
- Maximum 5 years from first accounting period
- **NOT available** to companies acquiring already-producing assets

---

## PART III – DEEP OFFSHORE & INLAND BASIN PSCs (Sections 102-117)

### Application (Section 102)

**Applies to:**
- Production sharing contracts
- Deep offshore and inland basin
- **Not yet converted** under PIA OR renegotiated per PIA

---

### Section 104 - PPT Rate

**50% of chargeable profits** for PSC areas

**Plus:** All other taxes (not exempted)

---

### Sections 108-111 - Oil Allocations (Monthly)

**Order of Allocation:**

1. **Royalty Oil:** To Commission/holder (for royalty + concession rental payment)

2. **Cost Oil:** To contractor (for operating cost recovery in US$)

3. **Tax Oil:** To Commission/holder (for PPT payment)

4. **Profit Oil:** Balance split per PSC terms

---

## SEVENTH SCHEDULE - PETROLEUM ROYALTY RATES

### Part III - Hydrocarbon Tax Royalties

**Production-Based:**

| Terrain | Standard Rate |
|---------|---------------|
| Onshore | 15% |
| Shallow water (up to 200m) | 12.5% |
| Deep offshore (beyond 200m) | 7.5% |
| Frontier basins | 7.5% |

**Natural Gas:**
- General: 5%
- In-country utilisation: 2.5%

---

### Part IV - PPT Royalties

**Crude Oil:**

| Terrain | Rate |
|---------|------|
| Onshore | 20% |
| Offshore up to 100m | 18.5% |
| Offshore 100-200m | 16.5% |
| Offshore beyond 200m | 10% |
| Frontier basin | 7.5% |
| Inland basin | 7.5% |`
  },
  {
    partNumber: 9,
    title: "Surcharge & Mining Royalty",
    content: `# Nigeria Tax Act 2025 - Part 9: Surcharge & Mining Royalty

## CHAPTER SEVEN – SURCHARGE ON FOSSIL FUELS

---

### Section 159 - Imposition of Surcharge

**Rate:** 5% on chargeable fossil fuel products

**Levy Point:** At time chargeable transaction occurs

**Purpose:** Environmental/climate change mitigation

---

### Section 160 - Chargeable Transaction & Base

**(1) Chargeable Transaction:**
- Supply
- Sale
- Payment
- **Whichever occurs first**

**(2) Computation Base:**
**Retail price** of all chargeable fossil fuel products

---

### Section 161 - Administration

**(1) Commencement:**
**Minister determines effective date** by Order in Official Gazette

**(2) Administration:**
- **Service administers** surcharge
- **Monthly collection**
- May issue regulations

**Status:** Not yet commenced (awaiting Ministerial Order)

---

### Section 162 - Exemptions

**Exempt Products:**
1. **Clean/renewable energy** products
2. **Household kerosene**
3. **Cooking gas**
4. **Compressed natural gas (CNG)**

**"Clean or Renewable Energy" Defined:**
Energy from:
- Solar
- Wind
- Hydropower
- Geothermal
- Plant and animal waste

---

## SUMMARY TABLE

| Product | Surcharge? | Rate | Base |
|---------|------------|------|------|
| Premium Motor Spirit (Petrol) | ✓ | 5% | Retail price |
| Automotive Gas Oil (Diesel) | ✓ | 5% | Retail price |
| Aviation Turbine Kerosene | ✓ | 5% | Retail price |
| Household Kerosene | ✗ | N/A | EXEMPT |
| Cooking Gas (LPG) | ✗ | N/A | EXEMPT |
| Compressed Natural Gas (CNG) | ✗ | N/A | EXEMPT |
| Solar/Wind/Hydro Energy | ✗ | N/A | EXEMPT |

---

## SOLID MINERALS ROYALTY

### Eighth Schedule - Mining Royalty (Section 64)

**Legal Basis:** Section 64(3) and Eighth Schedule

---

### Section 64 - Mining Operations

**(1) Mining Subject to Chapter 2 Income Tax:**
Trade or business in mining operations

**(2) Deductible Contributions:**
Amounts to approved funds for:
- Environmental protection
- Environmental remediation
- Mine rehabilitation
- Land reclamation
- Mine closure

**Conditions:**
- Cash-backed
- Dedicated account/trust fund
- Independent trustees/fund managers

**(3) Royalty Imposed:**
Per Eighth Schedule rates

**Tax Treatment:**
- Royalty is **tax deductible** for income tax
- Must comply with Tax Administration Act

**(4) Administration:**
**Service administers** mining royalty

---

### SOLID MINERALS ROYALTY RATES (Eighth Schedule)

**Ad Valorem Rates:**

| Mineral | Rate (%) |
|---------|----------|
| Antimony Ore | 7.5 |
| Bauxite | 7.5 |
| Bitumen/Tar Sand | 7.5 |
| Coal | 7.5 |
| Copper Ore | 7.5 |
| Iron Ore | 7.5 |
| Nickel | 7.5 |
| Silver Ore | 7.5 |
| **Gold Concentrate** | **15** |
| Most Gemstones | 10 |
| Most Processed Minerals | 10 |
| **Any Other Mineral** | **10** |

---

### ROYALTY RATE CATEGORIES

**Three Rate Tiers:**

1. **15%** - Gold concentrate only (highest)
2. **10%** - Most minerals, all gemstones, processed minerals
3. **7.5%** - Base metals, industrial minerals, some ores

---

### VALUE DETERMINATION

**Royalty Base:**
Value of solid mineral extracted

**Value Calculated Using:**
- Official selling price (Federal Ministry of Solid Minerals), OR
- Ruling prices on international trading platforms/markets

---

## KEY TAKEAWAYS

### Surcharge:
1. **5% on fossil fuel retail price**
2. **Not yet commenced** - awaiting Order
3. **Exempts household essentials** and clean energy
4. **Monthly remittance** to Service
5. **Environmental purpose**

### Mining Royalty:
1. **7.5% to 15%** ad valorem
2. **Gold highest** at 15%
3. **Service administers**
4. **Tax deductible** for income tax
5. **Value based on** international market/official prices
6. **Payment compliance** per Tax Administration Act`
  },
  {
    partNumber: 10,
    title: "Key Schedules Summary",
    content: `# Nigeria Tax Act 2025 - Part 10: Key Schedules Summary

## THE FOURTEEN SCHEDULES

---

## FIRST SCHEDULE - CAPITAL ALLOWANCES

### Three Parts by Tax Regime:

**Part I:** Chapter 2 Income Tax (Companies & Individuals)  
**Part II:** Hydrocarbon Tax (Petroleum Industry Act)  
**Part III:** Petroleum Profits Tax (Old OMLs/OPLs)

---

### PART I - CHAPTER 2 CAPITAL ALLOWANCES

**Three Classes - All Straight-Line:**

| Class | Rate | Assets |
|-------|------|--------|
| **1** | **10%** | Buildings, Agricultural assets, Masts, Intangible assets, Heavy transport equipment |
| **2** | **20%** | Plant & equipment, Furniture & fittings, Mining equipment, Agricultural equipment |
| **3** | **25%** | Motor vehicles, Software, Other capital expenditure |

**Key Rules:**
- Asset must be in use at end of basis period
- 1% retained for statistical purposes (doesn't reduce allowance)
- Hire purchase: allowance on instalments paid (exclude interest)
- Partnership: allowances apportioned per profit-sharing ratio
- Unutilized allowances carried forward indefinitely

**Qualifying Capital Expenditure:**
- VAT must be charged (if applicable)
- Import duty must be paid (if applicable)
- Otherwise expense not eligible

---

## FOURTH SCHEDULE - INDIVIDUAL TAX RATES

### Section 58 - Progressive Tax Bands

| Taxable Income Band | Rate |
|---------------------|------|
| First N800,000 | 0% |
| Next N2,200,000 (N800,001 - N3,000,000) | 15% |
| Next N9,000,000 (N3,000,001 - N12,000,000) | 18% |
| Next N13,000,000 (N12,000,001 - N25,000,000) | 21% |
| Next N25,000,000 (N25,000,001 - N50,000,000) | 23% |
| Above N50,000,000 | 25% |

**Calculation Example:**

**Chargeable Income: N60,000,000**

- First N800,000 @ 0% = N0
- Next N2,200,000 @ 15% = N330,000
- Next N9,000,000 @ 18% = N1,620,000
- Next N13,000,000 @ 21% = N2,730,000
- Next N25,000,000 @ 23% = N5,750,000
- Remaining N10,000,000 @ 25% = N2,500,000

**Total Tax: N12,930,000** (21.55% effective rate)

---

## SECOND SCHEDULE - EXPORT PROCESSING/FREE TRADE ZONES

### Tax Treatment (Section 60)

**Full Exemption (Subject to Section 57 - 15% minimum ETR):**
- 100% export sales OR inputs for export
- ≤25% sales to Nigerian customs territory

**Partial Taxation:**
- >25% customs sales: Tax on ALL customs sales

**Full Taxation from 1 January 2028:**
- All customs sales taxed (regardless of percentage)
- President may extend max 10 years from commencement

---

## THIRD SCHEDULE - INTEREST DEDUCTIBILITY

### Section 20(1)(a) & 92(1)(g)

**Rule:**
Interest to connected persons capped at **30% of EBITDA**

**EBITDA:**
Earnings Before Interest, Taxes, Depreciation, Amortisation

**Excess Interest:**
- Not deductible in current year
- Carry forward up to **5 years**
- Subject to 30% EBITDA cap in future years

**Exemptions:**
- Banking business
- Insurance business

---

## SEVENTH SCHEDULE - PETROLEUM ROYALTY

### Part III - Hydrocarbon Tax Royalties

**Production-Based:**

| Terrain | Standard Rate |
|---------|---------------|
| Onshore | 15% |
| Shallow water (up to 200m) | 12.5% |
| Deep offshore (beyond 200m) | 7.5% |
| Frontier basins | 7.5% |

**Natural Gas:**
- General: 5%
- In-country utilisation: 2.5%

---

## EIGHTH SCHEDULE - SOLID MINERALS ROYALTY

**Summary:**
- 73 minerals listed
- Rates: 7.5%, 10%, or 15%
- Gold highest at 15%
- Default: 10% for unlisted minerals

---

## TENTH SCHEDULE - ECONOMIC DEVELOPMENT INCENTIVE

### Priority Sectors & Products

**Key Sectors (with sunset dates):**
- Manufacturing (various subsectors)
- Agriculture and agro-processing
- Information & communication technology
- Tourism and hospitality
- Creative industries
- Infrastructure development
- Healthcare services
- Education services
- Renewable energy
- Solid minerals processing

**President may amend** by Order in Official Gazette

---

## THIRTEENTH SCHEDULE - AGRICULTURAL EXEMPTION

### Section 163(1)(p) & 187

**Five-Year Exemption for Agricultural Businesses**

**Eligible Activities:**

| Sub-Sector | Activity | Exempted Products |
|------------|----------|-------------------|
| **Crop Production** | Growing perennial/non-perennial crops | Raw/semi-processed crops |
| **Livestock** | Raising/breeding animals in ranches/farms | Live animals, raw products |
| **Livestock Processing** | Processing of livestock | Processed products |
| **Forestry** | Plantation of rubber, acacia trees | Raw forestry products |
| **Dairy** | Manufacture of dairy products | Dairy products |
| **Cocoa** | Processing of cocoa | Cocoa products |

**Exemption:**
- Income tax exempt for first 5 years
- From commencement of business
- Must be engaged in primary/processing activities

---

## FOURTEENTH SCHEDULE - DEFENCE & SECURITY FUND

### Section 59(6)

**Allocation of 10% of Development Levy**

| Agency | Percentage |
|--------|------------|
| Defence Headquarters | 8% |
| Nigerian Army | 20% |
| Nigerian Navy | 12.5% |
| Nigerian Air Force | 12.5% |
| Nigeria Police Force | 10% |
| Department of State Security | 9% |
| Police Trust Fund | 8% |
| ONSA/Counter-Terrorism Center | 6% |
| Nigerian Security & Civil Defence Corps | 5% |
| Nigerian Forest Security Service | 5% |
| Defence Intelligence Agency | 4% |

**Total:** 100% of the 10% allocation

---

## KEY TAKEAWAYS

1. **First Schedule:** Three separate capital allowance regimes
2. **Second Schedule:** Export zone incentives (with phase-out)
3. **Third Schedule:** Interest deductibility cap (30% EBITDA)
4. **Fourth Schedule:** Progressive individual tax rates (0% to 25%)
5. **Fifth Schedule:** Complex trust/estate taxation rules
6. **Sixth Schedule:** Petroleum production allowances & cost cap
7. **Seventh Schedule:** Comprehensive petroleum royalty rates
8. **Eighth Schedule:** Solid minerals royalty (73 minerals)
9. **Tenth Schedule:** EDTI priority sectors (with sunsets)
10. **Thirteenth Schedule:** 5-year agricultural exemption
11. **Fourteenth Schedule:** Security fund distribution formula`
  }
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get the FIRS regulatory body ID
    const { data: firsBody, error: firsError } = await supabase
      .from("regulatory_bodies")
      .select("id")
      .eq("abbreviation", "FIRS")
      .single();

    if (firsError || !firsBody) {
      throw new Error("FIRS regulatory body not found. Please create it first.");
    }

    // Check if document already exists
    const { data: existingDoc } = await supabase
      .from("legal_documents")
      .select("id")
      .eq("title", "Nigeria Tax Act 2025")
      .single();

    if (existingDoc) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Nigeria Tax Act 2025 already exists",
          documentId: existingDoc.id 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    // Combine all parts content
    const combinedContent = NIGERIA_TAX_ACT_PARTS.map(
      (part) => `--- PART ${part.partNumber}: ${part.title} ---\n\n${part.content}`
    ).join("\n\n");

    // Create the parent document
    const { data: parentDoc, error: parentError } = await supabase
      .from("legal_documents")
      .insert({
        title: "Nigeria Tax Act 2025",
        document_type: "legislation",
        regulatory_body_id: firsBody.id,
        effective_date: "2026-01-01",
        is_multi_part: true,
        total_parts: 10,
        processing_strategy: "sequential",
        status: "processing",
        raw_text: combinedContent,
        metadata: {
          source: "internal_import",
          imported_at: new Date().toISOString(),
          parts: NIGERIA_TAX_ACT_PARTS.map(p => ({ 
            number: p.partNumber, 
            title: p.title 
          }))
        }
      })
      .select()
      .single();

    if (parentError) {
      throw new Error(`Failed to create parent document: ${parentError.message}`);
    }

    // Create document parts
    const partsToInsert = NIGERIA_TAX_ACT_PARTS.map((part) => ({
      parent_document_id: parentDoc.id,
      part_number: part.partNumber,
      part_title: `Part ${part.partNumber}: ${part.title}`,
      raw_text: part.content,
      status: "pending",
      metadata: {
        word_count: part.content.split(/\s+/).length,
        has_tables: part.content.includes("|"),
        has_examples: part.content.toLowerCase().includes("example")
      }
    }));

    const { error: partsError } = await supabase
      .from("document_parts")
      .insert(partsToInsert);

    if (partsError) {
      // Cleanup parent if parts fail
      await supabase.from("legal_documents").delete().eq("id", parentDoc.id);
      throw new Error(`Failed to create document parts: ${partsError.message}`);
    }

    // Trigger multi-part processing
    const processResponse = await fetch(
      `${supabaseUrl}/functions/v1/process-multipart-document`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({ documentId: parentDoc.id }),
      }
    );

    const processResult = await processResponse.json();

    return new Response(
      JSON.stringify({
        success: true,
        documentId: parentDoc.id,
        title: "Nigeria Tax Act 2025",
        partsCreated: 10,
        processingStatus: processResult.success ? "started" : "manual_required",
        message: processResult.success 
          ? "Document imported and processing started. Check back in a few minutes."
          : `Document imported but processing needs manual trigger: ${processResult.error}`
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );

  } catch (error) {
    console.error("Import error:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});

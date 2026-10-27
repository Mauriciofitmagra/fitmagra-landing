# Recurring monthly payments for FitMagra in Colombia

- Date: 2026-10-27 (America/Bogota). Every source below was accessed on 2026-10-27.
- Status: research only. Nothing is built, no provider account exists, and no credentials were used.
- Scope: how to save a member's payment method and charge it every month, for the login-only member area. This covers providers, rails, invoicing, PCI, data protection, and consumer law.
- Not legal or tax advice. The items marked for a contador or lawyer need one.

Labels used in this document:

- **Verified.** Read on an official or primary page during this research, with the source number given.
- **Secondary.** From a non-official page or a search summary. Confirm it before relying on it.
- **Unverified.** Not found, or the official page did not load.
- **Inference.** Our reasoning from verified facts. It is not stated by any source.

## Recommendation

1. **Wompi payment sources, charged monthly by a Cloudflare Worker cron (recommended).** Wompi is the only provider whose public docs cover every piece we need. It saves a card, Nequi, DaviPlata, or Bancolombia account as a payment source and charges it later "sin necesidad de que ellos intervengan" [S1]. It publishes its fee (2,65% + COP 700 + IVA) and pays out the next business day [S5]. It onboards a persona natural with an RUT [S7]. It signs webhooks with SHA-256, which Workers supports natively [S3][S40]. The cost of this option is that Wompi has no plans engine and no automatic retries [S1][S4], so we write the monthly schedule and the dunning ourselves. That code is small, about one table and one cron handler.
2. **Treli on top of Wompi, if Mauricio must issue a DIAN invoice per charge or wants a ready-made portal.** Treli adds retries, a customer portal, and automatic e-invoices through Siigo or Alegra [S25][S26][S27]. It costs at least COP 279.000 per month plus about 1% per charge [S25]. That floor is close to one Standard member's monthly fee, so it only pays off once invoicing is mandatory or the member count grows.
3. **Mercado Pago Suscripciones, if we want the least code.** It has a native subscription engine with retries (up to 4 retries in 10 days, then cancellation after 3 rejected instalments) [S13]. The cost is a higher fee (3,29% + IVA for instant release) [S14] and a page that contradicts itself on the fixed fee. Onboarding rules for a persona natural were not found.

Do not use the following:

- **Stripe** (Colombia is not supported [S20]; the Atlas workaround creates US and Colombian tax exposure).
- **PayU** (recurring payments deprecated [S11]).
- **Bold** (no saved-card API [S9]).
- **Paddle and Lemon Squeezy** (both prohibit coaching [S29][S30]).
- **PSE as a recurring rail** (each payment needs the customer's approval in their bank [S31]).

The details and evidence follow.

## Starting point

The landing page sells three monthly plans at COP 250.000, 400.000, and 600.000, plus prepaid 2- and 3-month terms at 10% and 15% off (`index.html:1711-1786`). Members pay today by Nequi or DaviPlata, by bank transfer to Mauricio's personal accounts, in cash through Efecty or Baloto, and from abroad through Remitly or Western Union (`index.html:1829-1845`). Mauricio then confirms each payment by hand on WhatsApp. That suggests he operates as a persona natural today (inference). The Elite plan already promises the "Portal FitMagra" member area (`index.html:1768`).

## Terms used here

- **Tokenization or card-on-file.** The provider stores the card and gives us an ID, such as Wompi's `payment_source_id`. We never see or store the card number.
- **CIT and MIT.** A customer-initiated transaction (CIT) happens while the member is present, for example at sign-up. A merchant-initiated transaction (MIT) is a later charge without the member. Visa says the merchant "cannot perform any cardholder validation or authentication for MITs" [S35].
- **Native subscriptions or merchant-scheduled.** With native subscriptions, the provider runs the monthly schedule and the retries. With merchant-scheduled charges, our Worker decides when to charge and when to retry.
- **SAQ A or SAQ A-EP.** These are the PCI DSS self-assessment questionnaires. A is the short one, for payment pages served entirely by the provider. A-EP is longer and applies when our page controls the card form [S37][S38].

## Provider findings

### Wompi (Bancolombia)

- **Saved methods.** Tokenize with the public key: `POST /v1/tokens/cards`, `/tokens/nequi`, `/tokens/daviplata`, or `/tokens/bancolombia_transfer`. Then create a payment source from the backend with the private key (`POST /v1/payment_sources`). Two acceptance tokens are required, one for the privacy policy and one for personal-data processing. Charge later with `POST /v1/transactions` and `payment_source_id`. Set `recurrent: true` for card-on-file on Visa and Mastercard processed by RBM. Verified [S1].
- **Card tokens are single-use.** For repeat charges, the docs point to payment sources. Verified [S2].
- **Nequi and DaviPlata.** For Nequi, "the customer still needs to accept the subscription on his cellphone". DaviPlata needs an OTP and activation by DaviPlata's commercial team. Verified [S1].
- **Methods.** National and international cards (Visa, Mastercard, and Amex), PSE, Nequi, DaviPlata, Botón Bancolombia, cash at Bancolombia correspondents, and QR. Only cards, Nequi, DaviPlata, and Bancolombia transfer have token endpoints. PSE, cash, and QR are one-time. Verified [S2][S6].
- **Fee.** Plan Avanzado charges "2,65% + $700 + IVA" per approved transaction. International cards are "sin costo adicional", and the first month is at "0% de comisión". No monthly fee is stated. The pricing page shows no date. Verified [S5].
- **Payout.** "al siguiente día hábil de la venta". Verified [S5].
- **Onboarding.** A persona natural needs an updated RUT and a Bancolombia or Nequi account. A persona jurídica needs an RUT and an account in the NIT's name. Persona natural transactions are capped at COP 2.500.000 each, which covers every plan. Verified [S7] (support article dated 2026-04-08). Wompi's restricted-business list was not checked, because the 57-page terms PDF was only partly read. Unverified.
- **Retries.** Wompi's "reintento de pago" feature lets the buyer retry at checkout within 3 minutes. It is not dunning. Wompi documents no automatic retry of recurring charges. Verified [S4].
- **API and webhooks.** A REST API, with sandbox `https://sandbox.wompi.co/v1` and production `https://production.wompi.co/v1`. Verified [S8]. Events carry a SHA-256 checksum in the `X-Event-Checksum` header. Wompi retries a webhook 3 times within 24 hours if we don't return HTTP 200. Verified [S3].
- **3DS.** Payment sources can be created with 3DS on Visa and Mastercard. Later charges can use 3RI on Mastercard only, after Wompi's fraud team activates it. Verified [S10].
- **Workers.** No SDK is needed, and plain `fetch` works. The card-token call can encrypt the card as a JWE (RSA-OAEP-256 with A256GCM). A plain variant is also documented. Verified [S2].
- **PCI.** The card-token endpoint takes the public key, so it is called from our own JavaScript form. Inference: that puts us in SAQ A-EP. The docs do not say whether the Widget or Web Checkout can create a payment source, which would keep us in SAQ A. Unverified, and the first question to ask Wompi.

### ePayco (Davivienda)

- Native plans and subscriptions, with automatic charges. The subscription product is credit-card only and its recurrence features carry a "beta" badge. Verified [S16]. The docs pages are stale (updated 2021-11-26). Verified [S17].
- **Fee.** "2.64% + $690" if paid out to a Davivienda account, or "3.29% + $700" for other banks, plus IVA. Payouts to a bank account cost COP 6.500 + IVA. The pricing page lists withholdings on credit cards: reteIVA 15% of the IVA, retefuente 1,5%, and reteICA 0,2%. Verified [S15].
- Withdrawals take 24 to 72 business hours. Persona natural transactions run from COP 5.000 to 5.000.000. The restricted list names prescription drugs and invasive aesthetic treatments, plus a catch-all "a criterio de EPAYCO". Verified [S18].
- The confirmation callback is signed with SHA-256. Verified [S19]. The plans and subscriptions REST contract is documented mainly through SDKs. The Node SDK `epayco-node` exposes `subscriptions.charge`. Verified [S19a]. The SDK needs a client IP, and JWT plus AES-CBC are mentioned for PSE. Secondary. On Workers this works through `fetch`, but expect to reverse-engineer the SDK.
- Retry count and schedule were not found. Unverified.

### Mercado Pago Colombia

- Native subscriptions (`POST /preapproval` with `card_token_id`, `status: "authorized"`), weekly, monthly, or annual. Retries: a rejected charge is retried up to 4 times within 10 days. After 3 rejected instalments, the subscription is cancelled. Verified [S12][S13].
- Saved cards outside subscriptions need the CVV again on every payment, so they cannot be used for unattended charges. Verified [S12b].
- **Fee.** 3,29% + IVA (instant release), 2,99% + IVA (7 days), or 2,79% + IVA (14 days). The same page says both "No hay costos fijos" and "+ $800", so the fixed fee is unresolved. Verified, contradictory [S14].
- Webhooks carry an HMAC `x-signature` header. Verified [S14b]. The exact HMAC-SHA256 recipe is Secondary.
- Persona natural onboarding, retenciones, and which subscription methods besides cards can be charged automatically were not found. Unverified.

### PayU Latam (now Rapyd)

- Recurring Payments is "deprecated… We WILL NOT activate this feature again". Verified [S11]. Tokenization exists "under customized commercial agreements". Verified [S11a].
- The Colombian pricing page redirects to rapyd.net, so the fee is unverified. Rapyd's purchase of PayU's Latin American business is Secondary.
- PayU's Colombian restricted list marks "Suplementos dietarios" and "Productos Naturales" as restricted. Verified [S11b]. FitMagra's plans include supplement guidance.
- Confirmation signatures use MD5 by default. Verified [S11c]. Workers supports MD5 [S40].

### Bold

- No tokenization or saved-card object is documented. Payment links "solo pueden ser pagados una vez". Verified [S9]. Card payments through the API send the raw card number from the merchant, which is full PCI scope. Verified [S9a].
- **Fee.** Payment link "3,29% + $900 + retenciones", plus 1% for international cards. Verified [S9b] (rates for merchants from 2023-11-01).
- Good for one-off links. Not usable for recurring charges today.

### Kushki, Openpay, PlacetoPay, dLocal

- **Kushki.** Native scheduled card charges. By default it retries 3 times a day for 3 days. Onboarding asks for an RUT, a Cámara de Comercio certificate, and a shareholding certificate, and sign-up goes through a sales form. Verified [S21]. Colombian fees are unverified. This is built for companies, not a persona natural.
- **Openpay (BBVA).** Native plans with `retry_times` and `status_after_retry`. Verified [S22]. Webhooks use HTTP Basic auth only, with no signature, so every event must be re-fetched to trust it. Verified [S22a]. The fee page looks copied from Mexico. Verified, suspect.
- **PlacetoPay (Evertec).** Tokenizes and charges with `collect`. Retries once a day for 3 days, only on insufficient funds. Verified [S23]. Fees and onboarding unverified.
- **dLocal.** Has proper MIT fields (`stored_credential_type`, `transaction_link_id`). Verified [S24]. Aimed at merchants with "significant monthly online payment volume". Verified [S24a].

### Stripe

- Colombia is not a supported country. In Latin America only Brazil and Mexico are listed. Verified [S20].
- Atlas creates a Delaware C-corp or LLC for USD 500, then USD 100 per year. Verified [S20a].
- **US side.** A foreign-owned single-member LLC files a pro-forma Form 1120 with Form 5472. The penalty is USD 25.000, plus USD 25.000 per 30 days after IRS notice. Verified [S20b].
- **Colombian side.** A foreign company whose "sede efectiva de administración" is in Colombia is a Colombian national company for tax (ET art. 12-1). Verified [S20c]. A foreign entity controlled by Colombian residents is an ECE (ET art. 882). Verified [S20d]. Inference: an Atlas company run by Mauricio from Bogotá would likely be taxed as Colombian anyway, and add US filings on top.
- Members would pay with Colombian cards to a US merchant. That is a cross-border charge. We did not measure decline rates, so the effect is unverified.
- Stripe's product is the best of the group: Smart Retries (8 tries in 2 weeks by default) [S20e], `off_session` MIT charges [S20f], Billing at 0,7% of volume [S20g], and a Workers-ready SDK. None of that is worth a foreign entity at FitMagra's size.

### Recurring-billing SaaS and merchant of record

- **Treli.** Runs on Wompi, ePayco, PayU, Stripe, and PlacetoPay [S26], with Mercado Pago setup docs [S26a]. Tokenizes card, Nequi, and bank accounts for automatic debit [S26b]. Offers retries and dunning events [S27], a portal where customers update their card [S27a], and an API cancel action [S27b]. Webhooks are signed with HMAC-SHA256 [S27c]. "Treli generará facturas electrónicas en tu cuenta de Siigo" [S28], and Alegra works the same way [S28a]. The Starter plan is COP 279.000 per month, consumable against 1% per successful charge [S25]. All verified. The retry schedule is unverified, and so is whether customers can cancel from the portal.
- **Rebill.** Colombian card fees are 4,20% + USD 0,20 (credit) and 4,00% + USD 0,20 (debit). Verified [S29a]. Its local model needs a legal entity in Colombia. Verified [S29b]. More expensive than Wompi.
- **Paddle.** Prohibits "Human services that are not related to a software offering", including coaching, and medical advice such as "weight loss, muscle building". Verified [S29].
- **Lemon Squeezy.** Prohibits "Services of any kind". Verified [S30].

## Recommendation matrix

Fee per charge is our arithmetic on the published rate, for a COP 400.000 Elite charge, including 19% IVA on the fee. Withholdings are excluded because they are tax prepayments, not costs. See [Fee arithmetic](#fee-arithmetic).

| Option | Recurring model | Recurring methods | Fee per 400k charge | Payout | Persona natural | Retries | Webhook signature | Workers fit | Main risk |
|---|---|---|---|---|---|---|---|---|---|
| Wompi payment sources | We schedule | Card, Nequi, DaviPlata, Bancolombia | COP 13.447 (3,36%) | Next business day | Yes, with RUT | None, we build it | SHA-256 | REST and Web Crypto | SAQ A-EP and our own dunning |
| Treli on Wompi | Native | Card, Nequi, bank | Wompi fee + COP 4.000, with a 279k per month floor | Gateway's | Not stated | Yes, schedule unverified | HMAC-SHA256 | REST | Fixed monthly cost |
| Mercado Pago Suscripciones | Native | Card (others unclear) | COP 15.660 (3,92%), plus COP 800 if that applies | Instant to 14 days | Unverified | 4 in 10 days | HMAC | REST | Unclear fee, higher cost |
| ePayco subscriptions | Native (beta) | Credit card only | COP 13.388 (Davivienda payout) to 16.493 (other banks) | 24 to 72 h | Yes | Unverified | SHA-256 | Undocumented REST | Beta product, SDK-only docs |
| Kushki | Native | Card | Unverified | Daily to monthly | Unlikely | 3 per day for 3 days | HMAC-SHA256 | REST | Enterprise onboarding |
| Openpay | Native | Card | Unverified | Weekly | Unverified | Configurable | None (Basic auth) | REST | Unsigned webhooks |
| PayU | We schedule (recurring deprecated) | Card | Unverified | Unverified | Unverified | None | MD5 | REST | Deprecated, supplements restricted |
| Bold | None | None | Not applicable | Next day | Yes | Not applicable | HMAC-SHA256 | REST | No tokenization |
| Stripe via Atlas | Native | Card | 2,9% + 30¢ US, plus 0,7% Billing | US bank | Not applicable | Smart Retries | HMAC | Best SDK | US entity, 5472 penalty, sede efectiva |

### Fee arithmetic

These numbers come from published rates and are not measured, so they are only as good as the pricing pages. Withholdings are not costs. The 1,5% retefuente is credited against income tax. reteICA in Bogotá is 4,14 per thousand on ICA-taxed sales [S46]. ReteIVA only applies if Mauricio charges IVA.

| Plan | Wompi: 2,65% + 700, + IVA on the fee | Mercado Pago instant: 3,29%, + IVA on the fee | Treli add-on: 1% |
|---|---|---|---|
| Standard 250.000 | 8.717 (3,49%) | 9.788 (3,92%) | 2.500 |
| Elite 400.000 | 13.447 (3,36%) | 15.660 (3,92%) | 4.000 |
| Platino 600.000 | 19.754 (3,29%) | 23.491 (3,92%) | 6.000 |

Treli's COP 279.000 floor equals 1% of COP 27,9 million per month in charges [S25]. Below that volume, about 70 Elite members, Treli costs the flat 279.000. For a small member base, that floor is the dominant cost. Whether IVA applies to Treli's fee was not found.

## PSE, Nequi, DaviPlata, and bank debits

- **PSE cannot auto-debit.** Users "autorizan mediante la banca virtual de su banco el débito de los fondos" for each payment. Verified [S31][S31a].
- **PSE Avanza.** An ACH onboarding deck from 2021 describes a recurring variant with "un mecanismo de autorización (Código OTP)", depending on "la migración de entidades financieras". Verified [S32]. Whether it is live today, and whether every charge needs an OTP, is unverified. No gateway offers recurring PSE in its docs.
- **Débito automático (ACH).** The payer authorizes the biller's bank to "debitar su cuenta… periódicamente". The listed examples include "Suscripciones". The biller originates the debits through its own bank, which means a convenio de recaudo, not a gateway. Verified [S33][S33a]. Too heavy for a persona natural with a few dozen members (inference).
- **Nequi.** It has an official "API de suscripciones". The user authorizes once by push notification. "El usuario no autoriza montos ni fechas específicas". The user can cancel in the Nequi app. Verified [S34]. Wompi wraps this flow [S1].
- **DaviPlata.** Official "Débito Automático" APIs for "membresías, suscripciones". Verified [S34a]. Wompi wraps this with an OTP [S1].
- **Bre-B.** Banco de la República's page describes only sending and receiving money. Verified [S34b]. Press reports describe a private Bre-B débito product (DRUO, 2026-05-04). Secondary. Not a usable recurring rail yet.
- **Cash (Efecty, Baloto).** One-time by nature. Keep the existing manual flow, or a one-off Wompi or Bold link, for members who won't save a method.

## DIAN electronic invoicing

- **Who must invoice.** Res. 000165 de 2023 art. 7 requires invoices "por todas y cada una de las operaciones". The list includes IVA-registered taxpayers (num. 1), liberal professions (num. 3), and the Régimen Simple (num. 6). Verified [S41]. Arts. 7 and 8 are now compiled in Res. 227 de 2025, arts. 1.5.1.1.3.3 and 1.5.1.1.3.4. Verified [S41].
- **Exception.** Art. 8 num. 3 exempts the personas naturales of ET art. 437 par. 3 that meet all conditions. Verified [S41]. Those conditions are: gross income below 3.500 UVT in the previous or current year, one establishment, no single taxed contract of 3.500 UVT or more, and bank deposits from taxed activities under 3.500 UVT. Verified [S42].
- **The threshold in pesos.** The 2026 UVT is COP 52.374 (Res. 000238 de 2025). Verified [S43]. 3.500 UVT is COP 183.309.000 (arithmetic). At an average of COP 400.000 per member-month, that is about 458 member-months per year, or about 38 paying members on average (arithmetic). Above that, or if Mauricio joins the Régimen Simple, every monthly charge needs its own e-invoice. That is our reading of Res. 165 art. 5 ("al momento de efectuarse estas") [S41]. No rule allowing a consolidated invoice was found.
- **IVA.** ET art. 476 has no exclusion for coaching, training, or nutrition services. Verified [S44]. Inference: they are taxed at 19% once Mauricio is IVA-responsible. Whether a licensed nutritionist's work counts as an excluded health service is unresolved. Ask a contador.
- **Documento soporte.** Res. 000167 de 2021 covers purchases from people not obliged to invoice, for example foreign SaaS like Cloudflare or Treli's foreign peers. Verified that it exists [S45]. Its operative rules were not read, so who must issue it is unverified.
- **Invoicing tools.** Treli issues Siigo and Alegra invoices automatically [S28][S28a]. Alegra's API has an endpoint to stamp invoices. Verified [S47]. Its pricing and Siigo's prices are Secondary and conflicting. DIAN's free invoicing service exists. Secondary.
- **Card withholdings.** Card issuers withhold 1,5% retefuente on sales paid by card (DUR art. 1.3.2.1.8). Verified [S48]. A 2026 draft decree and bill would remove it, but nothing has been issued (Secondary). ReteIVA by card issuers is in ET art. 437-2 num. 5. Verified [S42]. In Bogotá, card issuers and acquirers withhold reteICA at 4,14 per thousand. Verified [S46]. The decree is now compiled in Decreto 639 de 2025 (not read).

## Card data and PCI DSS

- **Never store card numbers.** Store only the provider's token or payment source ID, the card brand, and the last 4 digits that the provider returns.
- **SAQ A** requires that "All elements of the payment page(s) delivered to the consumer's browser originate only and directly from" a PCI DSS compliant provider (an iframe or redirect). **SAQ A-EP** applies when our page builds the form or posts card data directly to the processor. Verified [S37][S38].
- **2025 change.** SAQ A r1 removed requirements 6.4.3 and 11.6.1 and added a criterion that merchants "confirm their site is not susceptible to attacks from scripts". For a full redirect the criterion does not apply. For an embedded iframe, the provider can confirm that its form protects against script attacks. Verified [S39][S39a].
- **For Wompi.** Calling `POST /v1/tokens/cards` from our own form puts us in SAQ A-EP (inference). Keep the card form isolated: a dedicated page, a strict Content-Security-Policy, no third-party scripts, and Subresource Integrity on Wompi's script. Ask Wompi whether its Widget can create a payment source, which would keep us in SAQ A.

## Member data (Ley 1581 de 2012)

- **Health data is sensitive.** Ley 1581 art. 5 lists "datos relativos a la salud" and biometric data as sensitive. Processing them needs "autorización explícita" (art. 6), and the member must be told that answering is optional (art. 12). Verified [S49].
- **Weight, measurements, injuries, blood type, and progress photos.** The member area should treat all of these as sensitive. Ask for a separate, explicit consent for them. Do not make access to the service conditional on that consent (Decreto 1377 art. 6). Verified [S50]. No SIC statement classifying photos as biometric was found. Unverified, so treat them as sensitive anyway.
- **Privacy policy contents.** Decreto 1377 art. 13 requires the controller's identity and contacts, the processing and its purpose, the member's rights, who handles requests, the procedure, and the effective date. Verified [S50].
- **Storage in the US.** International transfers need an adequate country (art. 26) [S49]. SIC Circular Externa 005 de 2017 lists "Estados Unidos de América" as adequate. Verified [S51].
- **RNBD registration.** Required for companies with assets over 100.000 UVT, not for natural persons. Secondary.
- Wompi requires the member's acceptance of its own privacy and data-processing terms before creating a payment source [S1]. That is separate from FitMagra's consent.

## Consumer protection and authentication

- **Withdrawal right (retracto).** Five business days (Ley 1480 art. 47). It does not apply to "contratos de prestación de servicios cuya prestación haya comenzado con el acuerdo del consumidor". Verified [S52]. Inference: get the member's explicit consent to start the service at sign-up, and refund in full if they withdraw before it starts.
- **Automatic renewal.** "Cláusulas de renovación automática que impidan al consumidor dar por terminado el contrato en cualquier momento" are ineffective (art. 43 num. 14). Verified [S52]. The member must be able to cancel at any time. Build self-service cancellation into the member area, effective at the end of the paid month.
- **Minimum stay.** Allowed only with a "ventaja sustancial", and never longer than one year (art. 41). Verified [S52]. The prepaid 2- and 3-month discounts fit this if they are paid upfront.
- **E-commerce duties.** Art. 50 requires the seller's identity and NIT, the total price with taxes, the payment methods, the withdrawal right, and a claims channel. Verified [S52].
- **Payment reversal.** Art. 51 lets the consumer have a payment reversed in cases of fraud or unsolicited charges, after complaining within 5 business days. Verified [S52]. A clear charge descriptor and a reminder email before each charge reduce reversal requests (inference).
- **Specific subscription laws.** No 2023-2026 law on subscription cancellation was found. Unverified.
- **3DS.** Visa requires cardholder consent to store the card, stored-credential indicators, and a zero-amount account verification if nothing is charged at sign-up [S35a]. Later MITs are not authenticated [S35]. EMVCo describes optional 3RI for later charges [S36]. No Colombian rule requiring strong authentication for every online card purchase was found [S36a]. Unverified, not asserted absent. Wompi's 3DS-on-creation flow fits this model [S10].

## Integration shape for option 1

This is the smallest design that works on Workers. It is a sketch, not a plan.

- **Data.** `members` (id, email, status), `subscriptions` (member_id, plan, amount_cop, current_period_end, payment_source_id, status, retry_count), and `charges` (subscription_id, period, wompi_transaction_id, status). Key `charges` by `(subscription_id, period)` so a re-run cron never charges twice.
- **Sign-up.** The first payment is a CIT with 3DS through Wompi. Then create the payment source and store its ID and the card's last 4 digits.
- **Monthly charge.** A daily Cron Trigger charges subscriptions whose period ended. It retries a failed charge on day 1, 3, and 7, then marks the subscription `past_due` and emails the member to update their method.
- **Webhooks.** Verify the SHA-256 checksum, then update `charges`. Treat the webhook as the source of truth, because Wompi retries it [S3].
- **Workers limits.** On the Free plan, a cron run gets 10 ms of CPU and 50 subrequests [S40a]. Each charge is at least one subrequest, so one run caps out below 50 charges. The Paid plan allows 10.000 subrequests per run. Use the Paid plan.

## Risks

- **Underwriting.** The Platino plan mentions supplements, "limpieza de órganos", and Traditional Chinese Medicine (`index.html:1792-1804`). PayU restricts supplements [S11b]. Stripe prohibits harmful nutraceutical claims [S20h]. Wompi's list is unverified. A reviewer may question these claims during onboarding.
- **PCI scope.** Self-hosting the Wompi card form means SAQ A-EP and a hardened page.
- **Our own dunning.** Option 1 puts retry logic in our code. A bug can double-charge or never charge. Mitigate with the `(subscription_id, period)` key and webhook reconciliation.
- **Invoicing threshold.** Past about 38 average members, or once Mauricio joins the Régimen Simple, every charge needs an e-invoice. Without Treli or an API integration, that is manual work.
- **Payouts to personal accounts.** Wompi pays a persona natural into a Bancolombia or Nequi account [S7]. Business income then mixes with personal funds.
- **Fee pages without dates.** Wompi and ePayco show no effective date on their pricing pages. Re-check before signing.

## Open questions for Roberto

1. **Legal entity.** Will FitMagra stay a persona natural (Mauricio, with an RUT), or become an SAS with an NIT? This decides the invoicing obligation, the IVA status, the Wompi account owner, and whether Kushki is open to us.
2. **RUT and tax status.** Is Mauricio IVA-responsible or in the Régimen Simple today? Does he expect more than COP 183.309.000 in gross income in 2026?
3. **Prices.** Do the prices stay at COP 250.000, 400.000, and 600.000 including IVA? If he becomes IVA-responsible, are those prices IVA-inclusive?
4. **Invoicing provider.** Siigo, Alegra, or DIAN's free service? Who at FitMagra issues invoices today?
5. **Prepaid terms.** Do the 2- and 3-month discounted terms stay as one-off payments, or become recurring every 2 or 3 months?
6. **International members.** How many pay from abroad? Wompi accepts international cards at no extra fee [S5], which could replace Remitly and Western Union.
7. **Wompi questions to send before building.** Can the Widget create a payment source (SAQ A)? Is coaching with supplement guidance acceptable? Which withholdings apply to a persona natural payout?

## Unverified items

- Wompi: whether the Widget can create a payment source, the restricted-business list, and the withholdings.
- Mercado Pago: the fixed fee, persona natural onboarding, and which subscription methods besides cards can be charged automatically.
- PayU: the current fees.
- Kushki and Openpay: the Colombian fees.
- ePayco: the retry schedule.
- Treli: the retry schedule and portal cancellation.
- PSE Avanza: whether it is live in 2026.
- DIAN: the operative rules of Res. 000167 de 2021, and the IVA treatment of nutrition services.
- Alegra and Siigo: API pricing.
- RNBD: the Decreto 090 de 2018 text.
- SIC: whether photos count as biometric data.
- Mastercard: the Transaction Link ID rule from 2026-10-23.
- Colombia: whether any rule requires strong authentication for online card purchases.

## Sources

All accessed 2026-10-27.

- S1. Wompi, Fuentes de pago: https://docs.wompi.co/docs/colombia/fuentes-de-pago/
- S2. Wompi, Métodos de pago: https://docs.wompi.co/docs/colombia/metodos-de-pago/
- S3. Wompi, Eventos: https://docs.wompi.co/docs/colombia/eventos/
- S4. Wompi, Reintento de pago: https://docs.wompi.co/en/docs/colombia/reintento-de-pago/
- S5. Wompi, Planes y tarifas: https://wompi.com/es/co/planes-tarifas/ and https://wompi.com/es/co/planes-tarifas/plan-avanzado-agregador
- S6. Wompi, Medios de pago: https://wompi.com/es/co/soluciones/pagos-en-linea/medios-de-pago
- S7. Wompi, persona natural requirements: https://soporte.wompi.co/hc/es-419/articles/360020955173
- S8. Wompi, Ambientes y llaves: https://docs.wompi.co/en/docs/colombia/ambientes-y-llaves/
- S9. Bold, Payment-links FAQ: https://ayuda.bold.co/es/preguntas-frecuentes-de-la-api-de-links-de-pagos-rkw4CCgTC.md
- S9a. Bold, API integration: https://developers.bold.co/pagos-en-linea/api-de-pagos-en-linea/integracion
- S9b. Bold, Tarifas: https://datafonos.bold.co/bienvenida-a-bold/tarifas/
- S10. Wompi, Fuentes de pago con 3DS: https://docs.wompi.co/en/docs/colombia/fuentes-de-pago-3ds/
- S11. PayU, Recurring payments (deprecated): https://developers.payulatam.com/latam/en/deprecated/recurring-payments.html
- S11a. PayU, Tokenization API: https://developers.payulatam.com/latam/en/docs/integrations/api-integration/tokenization-api.html
- S11b. PayU Colombia, Actividades restringidas y prohibidas: https://colombia.payu.com/wp-content/uploads/sites/5/2020/04/actividades_restringidas_y_prohibidas.pdf
- S11c. PayU, Confirmation URL: https://developers.payulatam.com/latam/en/docs/integrations/confirmation-url.html
- S12. Mercado Pago, Suscripciones overview: https://www.mercadopago.com.co/developers/es/docs/subscriptions/overview
- S12b. Mercado Pago, Saved cards: https://www.mercadopago.com.co/developers/es/docs/checkout-api-payments/how-tos/improve-payment-approval/saved-cards
- S13. Mercado Pago, Authorized payments: https://www.mercadopago.com.co/developers/es/docs/subscriptions/integration-configuration/subscription-no-associated-plan/authorized-payments
- S14. Mercado Pago, Link de pago (fees): https://www.mercadopago.com.co/herramientas-para-vender/link-de-pago
- S14b. Mercado Pago, Webhooks: https://www.mercadopago.com.co/developers/en/docs/your-integrations/notifications/webhooks
- S15. ePayco, Tarifas: https://www.epayco.com/tarifas/
- S16. ePayco, Suscripciones: https://epayco.com/suscripciones/
- S17. ePayco, Planes: https://docs.epayco.com/docs/planes.md
- S18. ePayco, Términos y condiciones 2026: https://epayco.com/terminos-y-condiciones-generales-2026/
- S19. ePayco, URL de confirmación: https://docs.epayco.com/docs/url-de-confirmacion.md
- S19a. ePayco, Node SDK: https://github.com/epayco/epayco-node
- S20. Stripe, Global availability: https://stripe.com/global
- S20a. Stripe Atlas: https://stripe.com/atlas
- S20b. IRS, Instructions for Form 5472: https://www.irs.gov/instructions/i5472
- S20c. Estatuto Tributario art. 12-1: https://estatuto.co/12-1
- S20d. Estatuto Tributario art. 882: https://estatuto.co/882
- S20e. Stripe, Smart Retries: https://docs.stripe.com/billing/revenue-recovery/smart-retries
- S20f. Stripe, Save and reuse: https://docs.stripe.com/payments/save-and-reuse.md?payment-ui=elements
- S20g. Stripe, Billing pricing: https://stripe.com/billing/pricing
- S20h. Stripe, Restricted businesses: https://stripe.com/legal/restricted-businesses
- S21. Kushki, Scheduled payments: https://docs.kushki.com/co/recurring-payments/scheduled-payments/overview and onboarding documents: https://soporte.kushkipagos.com/hc/en-us/articles/15248914506259
- S22. Openpay Colombia, API reference: https://documents.openpay.co/api/index.html
- S22a. Openpay Colombia, Webhooks: https://docs.openpay.co/docs/webhooks.html
- S23. PlacetoPay, Create session: https://docs.placetopay.dev/checkout/create-session
- S24. dLocal, Merchant-initiated transactions: https://docs.dlocal.com/docs/merchant-initiated-transactions
- S24a. dLocal, FAQ: https://www.dlocal.com/faqs/
- S25. Treli, Planes: https://treli.co/planes/
- S26. Treli, Pasarelas de pago: https://treli.readme.io/reference/pasarelas-de-pago.md
- S26a. Treli, docs index: https://treli.readme.io/llms.txt
- S26b. Treli, Múltiples pasarelas: https://treli.co/multiples-pasarelas-y-metodos-de-pago
- S27. Treli, Event types: https://treli.readme.io/reference/tipos-de-eventos.md
- S27a. Treli, Customer portal: https://treli.readme.io/reference/configura-el-portal-de-clientes-con-la-api.md
- S27b. Treli, Subscription actions: https://treli.readme.io/reference/post_subscriptions-actions-1.md
- S27c. Treli, Security: https://treli.readme.io/reference/seguridad.md
- S28. Treli, Siigo integration: https://intercom.help/treli/es/articles/10944642-como-integrar-treli-con-mi-cuenta-de-siigo
- S28a. Treli, Alegra integration: https://intercom.help/treli/es/articles/12055034-como-integrar-treli-con-mi-cuenta-de-alegra
- S29. Paddle, What am I not allowed to sell: https://www.paddle.com/help/start/account-verification/what-am-i-not-allowed-to-sell-on-paddle
- S29a. Rebill, Pricing: https://www.rebill.com/pricing
- S29b. Rebill, Processing models: https://docs.rebill.com/guides/processing-models.md
- S30. Lemon Squeezy, Prohibited products: https://docs.lemonsqueezy.com/help/getting-started/prohibited-products
- S31. ACH Colombia: https://www.achcolombia.com.co/
- S31a. PSE, Personas FAQ: https://www.pse.com.co/persona
- S32. PSE, INS-021 Vinculación de empresas (2021): https://www.pse.com.co/documents/1176700/1193885/INS-021+Vinculaci%C3%B3n+de+empresas+ante+PSE+-+julio.pdf/e0b6f3ae-3fde-2d5d-9fe4-3e315cb7d407?t=1688054355680
- S33. ACH Colombia, Reglamento ACH Transferencias v2 (2022): https://www.achcolombia.com.co/documents/1176249/5313778/Reglamento_Transfiya_VF_2_Pub.pdf/20e71d28-b9f9-237d-a204-508eb65b4dfb?t=1649786020890
- S33a. ACH Colombia, Productos y servicios: https://www.achcolombia.com.co/productos-y-servicios
- S34. Nequi, Pagos recurrentes: https://www.nequi.com.co/negocios/pagos-recurrentes
- S34a. DaviPlata, APIs: https://www.daviplata.com/empresas-y-gobierno/api
- S34b. Banco de la República, Bre-B: https://www.banrep.gov.co/es/bre-b
- S35. Visa, MIT Service flyer: https://usa.visa.com/content/dam/VCOM/regional/na/us/support-legal/documents/visa-network-mit-service-flier-accessible.pdf
- S35a. Visa, Transaction identification reminders: https://usa.visa.com/dam/VCOM/global/support-legal/documents/in-app-transaction-identification-reminders.pdf
- S36. EMVCo, 3DS white paper (recurring): https://www.emvco.com/dynamic/emv-3-d-secure-whitepaper-v2/recurring-and-installment-transactions/technical-features/
- S36a. Superfinanciera, CE 008 de 2018 press release: https://www.superfinanciera.gov.co/publicaciones/10097769/superfinanciera-fortalece-la-proteccion-de-la-informacion-de-los-consumidores-financieros-ante-riesgos-de-ciberseguridad-y-la-realizacion-de-operaciones-en-pasarelas-de-pago-10097769/
- S37. PCI SSC, FAQ on SAQ A versus A-EP: https://pcisecuritystandards.org/faq/articles/Frequently_Asked_Question/why-is-saq-a-ep-used-for-direct-post-while-saq-a-is-used-for-iframe-or-url-redirect
- S38. PCI SSC, SAQ A-EP v4.0: https://listings.pcisecuritystandards.org/documents/PCI-DSS-v4-0-SAQ-A-EP.pdf
- S39. PCI SSC blog, SAQ A updates: https://blog.pcisecuritystandards.org/important-updates-announced-for-merchants-validating-to-self-assessment-questionnaire-a
- S39a. PCI SSC, FAQ 1588: https://www.pcisecuritystandards.org/faqs/1588/
- S40. Cloudflare, Web Crypto: https://developers.cloudflare.com/workers/runtime-apis/web-crypto/
- S40a. Cloudflare, Workers limits: https://developers.cloudflare.com/workers/platform/limits/ and Cron Triggers: https://developers.cloudflare.com/workers/configuration/cron-triggers/
- S41. DIAN, Resolución 000165 de 2023: https://normograma.dian.gov.co/dian/compilacion/docs/resolucion_dian_0165_2023.htm
- S42. Estatuto Tributario arts. 437, 437-1, 437-2: https://normativa.colpensiones.gov.co/colpens/docs/estatuto_tributario_pr017.htm
- S43. DIAN, Resolución 000238 de 2025 (UVT 2026): https://normograma.dian.gov.co/dian/compilacion/docs/resolucion_dian_0238_2025.htm
- S44. Estatuto Tributario art. 476: https://normativa.colpensiones.gov.co/colpens/docs/estatuto_tributario_pr019.htm
- S45. DIAN, Facturación electrónica normatividad: https://micrositios.dian.gov.co/sistema-de-facturacion-electronica/normatividad/
- S46. Bogotá, Decreto 472 de 2002 (reteICA): https://www.alcaldiabogota.gov.co/sisjur/normas/Norma1.jsp?i=6149
- S47. Alegra, API: https://developer.alegra.com/
- S48. DIAN, Oficio 000165 de 2025 (card retefuente): https://normograma.dian.gov.co/dian/compilacion/docs/oficio_dian_0165_2025.htm
- S49. Ley 1581 de 2012: https://normograma.dian.gov.co/dian/compilacion/docs/ley_1581_2012.htm
- S50. Decreto 1377 de 2013: https://normograma.dian.gov.co/dian/compilacion/docs/decreto_1377_2013.htm
- S51. SIC, Circular Externa 005 de 2017: https://normativa.colpensiones.gov.co/colpens/docs/circular_superindustria_0005_2017.htm
- S52. Ley 1480 de 2011: https://normograma.dian.gov.co/dian/compilacion/docs/ley_1480_2011.htm

## Method

- Five read-only research agents each covered one seam: Colombian gateways, regional gateways with Stripe, billing SaaS with Workers, payment rails with PCI, and Colombian law with tax. Each one labelled every fact Verified, Secondary, or Not found, and listed the URLs it fetched. This document cites only URLs those agents reported fetching.
- Agents did not sign up for, log in to, or submit anything. One agent reported hidden instructions embedded in the DaviPlata API page and ignored them.
- Some primary sources were unreachable: secretariasenado.gov.co refused the connection, funcionpublica.gov.co failed its certificate check, banrep.gov.co pages were behind a bot check, and the PCI SAQ A r1 PDF returned 403. For these, the document cites the government normogramas (DIAN, Colpensiones) and the PCI SSC blog and FAQ instead.
- The fee figures are arithmetic on published rates, not measured transactions.

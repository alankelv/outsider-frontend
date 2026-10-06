const API = "https://outsider-api.lednakdesigns.workers.dev";

// Reserved local test account. This exact credential is handled only by the
// frontend test harness and never reaches the production auth API.
const OUTSIDER_TEST_ACCOUNT = {
  email: "test@outsider.local",
  password: "OutsiderTest123!",
  username: "Outsider Test"
};

const OUTSIDER_TEST_SESSION_KEY = "outsider_mock_test_session";
const OUTSIDER_TEST_BUSINESS_KEY = "outsider_mock_test_business";

const app = document.getElementById("app");

const state = {
  identifierMode: "email",
  email: "",
  mobile: "",
  selectedCountry: {
    name: "Nigeria",
    isoCode: "NG",
    callingCode: "+234",
    flag: "🇳🇬"
  },
  selectedCountryCode: "+234",
  password: "",
  showPassword: false,
  countryPickerOpen: false,
  countrySearch: "",
  loading: false,
  error: "",
  validation: {
    identifier: "",
    password: ""
  }
};

function isOutsiderTestAccount(email, password) {
  return String(email || "").trim().toLowerCase() === OUTSIDER_TEST_ACCOUNT.email &&
    String(password || "") === OUTSIDER_TEST_ACCOUNT.password;
}

function isOutsiderTestEmail(email) {
  return String(email || "").trim().toLowerCase() === OUTSIDER_TEST_ACCOUNT.email;
}

function hasOutsiderTestSession() {
  try {
    return sessionStorage.getItem(OUTSIDER_TEST_SESSION_KEY) === "active";
  } catch {
    return false;
  }
}

function startOutsiderTestSession() {
  try {
    sessionStorage.setItem(OUTSIDER_TEST_SESSION_KEY, "active");
    sessionStorage.removeItem(OUTSIDER_TEST_BUSINESS_KEY);
  } catch {}
}

function clearOutsiderTestSession() {
  try {
    sessionStorage.removeItem(OUTSIDER_TEST_SESSION_KEY);
    sessionStorage.removeItem(OUTSIDER_TEST_BUSINESS_KEY);
    sessionStorage.removeItem("outsider_onboarding_business");
    sessionStorage.removeItem("outsider_payment_setup");
    sessionStorage.removeItem("outsider_kyc_state");
  } catch {}
}

function isOutsiderTestMode() {
  return hasOutsiderTestSession();
}

// Call this from the final onboarding completion action when that screen is implemented.
function completeOutsiderTestOnboarding() {
  if (!isOutsiderTestMode()) return false;
  clearOutsiderTestSession();
  return true;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getIdentifierValue() {
  return state.identifierMode === "email" ? state.email : state.mobile;
}

function setIdentifierValue(value) {
  if (state.identifierMode === "email") {
    state.email = value;
  } else {
    state.mobile = normalizePhoneNumber(value);
  }
}

function getLoginCanonicalPhoneNumber() {
  return state.selectedCountryCode + normalizePhoneNumber(state.mobile);
}

function getLoginFilteredCountries() {
  const query = state.countrySearch.trim().toLowerCase();

  if (!query) {
    return signupCountries;
  }

  return signupCountries.filter((country) =>
    (country.name + " " + country.isoCode + " " + country.callingCode)
      .toLowerCase()
      .includes(query)
  );
}

function formatLoginPhoneNumber(value) {
  const digits = normalizePhoneNumber(value);

  if (!digits) {
    return "";
  }

  if (state.selectedCountry.isoCode === "NG" && digits.length <= 10) {
    const parts = [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 10)];
    return parts.filter(Boolean).join(" ");
  }

  const parts = [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 15)];
  return parts.filter(Boolean).join(" ");
}

async function loadLoginCountries() {
  if (signupState.countriesLoaded || signupState.countriesLoading) {
    return;
  }

  signupState.countriesLoading = true;

  try {
    const response = await fetch(SIGNUP_COUNTRIES_DATA_URL, {
      method: "GET",
      headers: { Accept: "application/json" }
    });

    if (!response.ok) {
      throw new Error("Unable to load country data");
    }

    const data = await response.json();

    const countries = Object.entries(data)
      .map(([isoCode, country]) => ({
        name: String(country?.name || "").trim(),
        isoCode: isoCode.toUpperCase(),
        callingCode: String(country?.dialCode || "").trim(),
        flag: String(country?.flag || "").trim() || countryFlagFromIso(isoCode)
      }))
      .filter((country) => country.name && country.callingCode)
      .sort((a, b) => {
        if (a.isoCode === "NG") return -1;
        if (b.isoCode === "NG") return 1;
        return a.name.localeCompare(b.name);
      });

    if (!countries.length) {
      throw new Error("Country data is empty");
    }

    signupCountries = countries;
    signupState.countriesLoaded = true;

    const selected = signupCountries.find(
      (country) => country.isoCode === state.selectedCountry.isoCode
    );

    if (selected) {
      state.selectedCountry = selected;
      state.selectedCountryCode = selected.callingCode;
    }
  } catch {
    // Keep Nigeria as the usable default if country data is unavailable.
  } finally {
    signupState.countriesLoading = false;
  }
}

function positionLoginCountryDropdown() {
  if (!state.countryPickerOpen) {
    return;
  }

  const button = document.getElementById("login-country-button");
  const dropdown = document.getElementById("login-country-dropdown");
  const field = button?.closest(".login-phone-field");
  const rect = field?.getBoundingClientRect();

  if (!rect || !dropdown) {
    return;
  }

  const viewportPadding = 15;
  const preferredMaxHeight = 300;
  const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
  const spaceAbove = rect.top - viewportPadding;
  const openAbove = spaceBelow < 220 && spaceAbove > spaceBelow;
  const availableHeight = Math.max(
    180,
    Math.min(preferredMaxHeight, openAbove ? spaceAbove : spaceBelow)
  );

  dropdown.style.left = Math.round(rect.left) + "px";
  dropdown.style.width = Math.round(rect.width) + "px";
  dropdown.style.maxHeight = Math.round(availableHeight) + "px";

  if (openAbove) {
    dropdown.style.top = Math.round(rect.top - availableHeight - 6) + "px";
    dropdown.style.transformOrigin = "bottom center";
  } else {
    dropdown.style.top = Math.round(rect.bottom) + "px";
    dropdown.style.transformOrigin = "top center";
  }
}

function BackButton() {
  return `
    <button class="back-button" id="back-button" type="button" aria-label="Back">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M14.5 5.5L8 12L14.5 18.5"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"/>
      </svg>
    </button>
  `;
}

function PasswordInput() {
  return `
    <div class="password-field">
      <label class="field-label password-label" for="password">Enter Password</label>

      <div class="input-wrap">
        <input
          class="text-input password-input"
          id="password"
          name="password"
          type="${state.showPassword ? "text" : "password"}"
          autocomplete="current-password"
          placeholder="Create password"
          value="${escapeHtml(state.password)}"
          aria-invalid="${state.validation.password ? "true" : "false"}"
          ${state.validation.password ? 'aria-describedby="password-error"' : ""}
          required
        >

        <button
          class="password-toggle"
          id="password-toggle"
          type="button"
          aria-label="${state.showPassword ? "Hide password" : "Show password"}"
        >
          ${state.showPassword ? `
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M2.7 12s3.4-5 9.3-5 9.3 5 9.3 5-3.4 5-9.3 5-9.3-5-9.3-5Z"
                stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
              <circle cx="12" cy="12" r="2.2" stroke="currentColor" stroke-width="1.7"/>
            </svg>
          ` : `
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M2.7 12s3.4-5 9.3-5 9.3 5 9.3 5-3.4 5-9.3 5-9.3-5-9.3-5Z"
                stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
              <circle cx="12" cy="12" r="2.2" stroke="currentColor" stroke-width="1.7"/>
              <path d="M4.5 4.5L19.5 19.5"
                stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
            </svg>
          `}
        </button>
      </div>

      ${state.validation.password
        ? `<p class="field-error" id="password-error">${escapeHtml(state.validation.password)}</p>`
        : ""}
    </div>
  `;
}

function LoginMethodRow() {
  const emailMode = state.identifierMode === "email";

  return `
    <div class="login-method-row">
      <label class="field-label" for="identifier">
        ${emailMode ? "Email Address" : "Mobile Number"}
      </label>

      <button
        class="method-toggle"
        id="method-toggle"
        type="button"
        aria-label="${emailMode ? "Switch to mobile number login" : "Switch to email login"}"
      >
        ${emailMode ? "Mobile Number?" : "Email Address?"}
      </button>
    </div>
  `;
}

function SocialLoginButtons() {
  return `
    <div class="social-buttons">
      <button class="social-button" type="button" id="facebook-login" aria-label="Continue with Facebook">
        <svg viewBox="0 0 34 34" aria-hidden="true">
          <rect x="1" y="1" width="32" height="32" rx="5" fill="#1877F2"/>
          <path d="M20.1 18.1h3.2l.5-3.6h-3.7v-2.3c0-1 .5-1.8 2-1.8H24V7.2c-.4-.1-1.6-.2-3-.2-3 0-5.1 1.8-5.1 5.1v2.4h-3.4v3.6h3.4v8.7h4.2v-8.7Z" fill="#FFFFFF"/>
        </svg>
      </button>

      <button class="social-button" type="button" id="instagram-login" aria-label="Continue with Instagram">
        <svg viewBox="0 0 34 34" aria-hidden="true">
          <defs>
            <linearGradient id="instagram-gradient" x1="4" y1="30" x2="30" y2="4" gradientUnits="userSpaceOnUse">
              <stop stop-color="#F58529"/>
              <stop offset=".45" stop-color="#DD2A7B"/>
              <stop offset=".75" stop-color="#8134AF"/>
              <stop offset="1" stop-color="#515BD4"/>
            </linearGradient>
          </defs>
          <rect x="4" y="4" width="26" height="26" rx="7" fill="none" stroke="url(#instagram-gradient)" stroke-width="3"/>
          <circle cx="17" cy="17" r="6" fill="none" stroke="url(#instagram-gradient)" stroke-width="3"/>
          <circle cx="24.2" cy="9.8" r="1.7" fill="#DD2A7B"/>
        </svg>
      </button>

      <button class="social-button" type="button" id="google-login" aria-label="Continue with Google">
        <svg viewBox="0 0 34 34" aria-hidden="true">
          <path d="M31.2 17.35c0-.96-.08-1.88-.25-2.77H17v5.24h7.94a6.8 6.8 0 0 1-2.95 4.46v3.7h4.77c2.79-2.57 4.44-6.36 4.44-10.63Z" fill="#4285F4"/>
          <path d="M17 31.5c3.99 0 7.33-1.32 9.76-3.57l-4.77-3.7c-1.32.89-3 1.42-4.99 1.42-3.84 0-7.1-2.6-8.27-6.1H3.8v3.82A14.74 14.74 0 0 0 17 31.5Z" fill="#34A853"/>
          <path d="M8.73 19.55A8.87 8.87 0 0 1 8.27 17c0-.88.16-1.74.46-2.55v-3.82H3.8A14.5 14.5 0 0 0 2.25 17c0 2.34.56 4.55 1.55 6.37l4.93-3.82Z" fill="#FBBC05"/>
          <path d="M17 8.35c2.17 0 4.12.75 5.65 2.23l4.23-4.23C24.32 3.96 20.98 2.5 17 2.5A14.74 14.74 0 0 0 3.8 10.63l4.93 3.82c1.17-3.5 4.43-6.1 8.27-6.1Z" fill="#EA4335"/>
        </svg>
      </button>
    </div>
  `;
}

function LoginCountryDropdown() {
  if (!state.countryPickerOpen) {
    return "";
  }

  return `
    <div class="login-country-dropdown" id="login-country-dropdown">
      <div class="login-country-search-wrap">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="1.8"/>
          <path d="M16 16l4.2 4.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
        <input
          id="login-country-search"
          class="login-country-search"
          type="search"
          placeholder="Search country"
          value="${escapeHtml(state.countrySearch)}"
          autocomplete="off"
          aria-label="Search country"
        >
      </div>

      <div class="login-country-list" id="login-country-list">
        ${getLoginFilteredCountries().map((country) => `
          <button
            class="login-country-option ${country.isoCode === state.selectedCountry.isoCode ? "is-selected" : ""}"
            type="button"
            data-login-country-iso="${country.isoCode}"
            aria-label="${escapeHtml(country.name)}, ${escapeHtml(country.callingCode)}"
            aria-pressed="${country.isoCode === state.selectedCountry.isoCode ? "true" : "false"}"
          >
            <span class="login-country-option-main">
              <span class="login-country-flag" aria-hidden="true">${country.flag}</span>
              <span class="login-country-name">${escapeHtml(country.name)}</span>
            </span>
            <span class="login-country-option-code">
              ${escapeHtml(country.callingCode)}
              ${country.isoCode === state.selectedCountry.isoCode
                ? '<span class="login-country-check" aria-hidden="true">✓</span>'
                : ""}
            </span>
          </button>
        `).join("") || '<p class="login-country-empty">No countries found</p>'}
      </div>
    </div>
  `;
}

function LoginScreen() {
  const emailMode = state.identifierMode === "email";
  const identifierValue = getIdentifierValue();

  return `
    <div class="mobile-app-shell">
      <div class="login-page">
        <div class="login-scroll">
          <main class="login-content">
            ${BackButton()}

            <header class="login-header">
              <h1 class="login-title">Login</h1>
              <p class="login-subtitle">Login to continue</p>
            </header>

            <form class="login-form" id="login-form" novalidate>
              ${LoginMethodRow()}

              ${emailMode ? `
                <div class="input-wrap">
                  <input
                    class="text-input"
                    id="identifier"
                    name="email"
                    type="email"
                    inputmode="email"
                    autocomplete="email"
                    placeholder="Enter email address"
                    value="${escapeHtml(state.email)}"
                    aria-invalid="${state.validation.identifier ? "true" : "false"}"
                    ${state.validation.identifier ? 'aria-describedby="identifier-error"' : ""}
                    required
                  >
                </div>
              ` : `
                <div class="login-phone-anchor">
                  <div
                    class="login-phone-field"
                    aria-label="Mobile Number"
                    aria-invalid="${state.validation.identifier ? "true" : "false"}"
                  >
                    <button
                      class="login-country-button"
                      id="login-country-button"
                      type="button"
                      aria-label="Select country code. ${escapeHtml(state.selectedCountry.name)}, ${escapeHtml(state.selectedCountryCode)}"
                      aria-expanded="${state.countryPickerOpen ? "true" : "false"}"
                    >
                      <span class="login-country-code">${escapeHtml(state.selectedCountryCode)}</span>
                      <svg class="login-country-chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M7 10l5 5 5-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                      </svg>
                    </button>
                    <span class="login-phone-divider" aria-hidden="true"></span>
                    <input
                      class="login-phone-input"
                      id="identifier"
                      name="phone"
                      type="tel"
                      inputmode="tel"
                      autocomplete="tel"
                      placeholder="000 000 000"
                      value="${escapeHtml(formatLoginPhoneNumber(state.mobile))}"
                      aria-label="Mobile Number"
                      aria-invalid="${state.validation.identifier ? "true" : "false"}"
                      ${state.validation.identifier ? 'aria-describedby="identifier-error"' : ""}
                      required
                    >
                  </div>
                  ${LoginCountryDropdown()}
                </div>
              `}

              ${state.validation.identifier
                ? `<p class="field-error" id="identifier-error">${escapeHtml(state.validation.identifier)}</p>`
                : ""}

              ${PasswordInput()}

              <div class="forgot-row">
                <a class="forgot-link" href="/forgot-password">Forgot password?</a>
              </div>

              ${state.error
                ? `<p class="form-error" id="form-error" role="alert">${escapeHtml(state.error)}</p>`
                : ""}

              <button
                class="login-submit"
                id="login-submit"
                type="submit"
                ${state.loading ? "disabled" : ""}
              >
                ${state.loading
                  ? '<span class="login-spinner" aria-hidden="true"></span><span>Logging in...</span>'
                  : "Login"}
              </button>
            </form>

            <section class="social-section" aria-label="Social login">
              <div class="social-divider">
                <span class="social-divider-line" aria-hidden="true"></span>
                <span class="social-divider-text">Or login with</span>
                <span class="social-divider-line" aria-hidden="true"></span>
              </div>

              ${SocialLoginButtons()}
            </section>

            <div class="signup-prompt">
              <span>Don't have an account</span>
              <a class="signup-link" href="/signup">Signup</a>
            </div>
          </main>
        </div>
      </div>
    </div>
  `;
}

const onboardingBusinessState = {
  businessName: "",
  businessLocation: "",
  locationData: {
    displayName: "",
    address: "",
    latitude: null,
    longitude: null,
    placeId: ""
  },
  vendorType: "",
  loading: false,
  error: "",
  validation: {
    businessName: "",
    businessLocation: "",
    vendorType: ""
  }
};

const paymentSetupState = {
  mobileMoneyExpanded: false,
  emailPaymentExpanded: false,
  mobileProviderOpen: false,
  emailProviderOpen: false,
  mobileProviderSearch: "",
  emailProviderSearch: "",
  mobileMoneyProvider: "",
  mobileMoneyAccountNumber: "",
  mobileMoneyAccountHolder: "",
  emailPaymentProvider: "",
  emailPaymentAccountIdentifier: "",
  emailPaymentAccountHolder: "",
  savedMethods: [],
  loading: false,
  savingCategory: "",
  removingId: "",
  error: "",
  validation: {
    mobile: "",
    email: ""
  },
  kycOpen: false,
  kycLoading: false
};

const kycState = {
  screen: "overview",
  kycStatus: "NOT_STARTED",
  idVerificationStatus: "UNVERIFIED",
  selfieVerificationStatus: "NOT_STARTED",
  documentType: "",
  documentNumber: "",
  verifiedFullName: "",
  verifiedDateOfBirth: "",
  verifiedDateOfBirthCanonical: "",
  verificationId: "",
  verificationProvider: "",
  selfieVerificationId: "",
  selfieDataUrl: "",
  idError: "",
  selfieError: "",
  loading: false,
  cameraPermission: "unknown",
  cameraMessage: "",
  cameraStream: null,
  capturedImage: "",
  cameraStarting: false,
  cameraFacingMode: "user",
  showKycSuccessModal: false
};

const KYC_STORAGE_KEY = "outsider_kyc_state";
const KYC_DOCUMENT_TYPES = [
  { value: "NIN", label: "National ID / NIN", placeholder: "00000000000", pattern: /^\d{11}$/ },
  { value: "DRIVERS_LICENSE", label: "Driver's Licence", placeholder: "Enter driver's licence number", pattern: /^[A-Za-z0-9-]{5,24}$/ },
  { value: "PASSPORT", label: "International Passport", placeholder: "Enter passport number", pattern: /^[A-Za-z0-9]{6,18}$/ }
];

function loadKycState() {
  try {
    const raw = sessionStorage.getItem(KYC_STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== "object") return;
    Object.assign(kycState, {
      screen: saved.screen || "overview",
      kycStatus: saved.kycStatus || "NOT_STARTED",
      idVerificationStatus: saved.idVerificationStatus || "UNVERIFIED",
      selfieVerificationStatus: saved.selfieVerificationStatus || "NOT_STARTED",
      documentType: String(saved.documentType || ""),
      documentNumber: String(saved.documentNumber || ""),
      verifiedFullName: String(saved.verifiedFullName || ""),
      verifiedDateOfBirth: String(saved.verifiedDateOfBirth || ""),
      verifiedDateOfBirthCanonical: String(saved.verifiedDateOfBirthCanonical || ""),
      verificationId: String(saved.verificationId || ""),
      verificationProvider: String(saved.verificationProvider || ""),
      selfieVerificationId: String(saved.selfieVerificationId || ""),
      selfieDataUrl: String(saved.selfieDataUrl || ""),
      idError: String(saved.idError || ""),
      selfieError: String(saved.selfieError || ""),
      showKycSuccessModal: Boolean(saved.showKycSuccessModal)
    });
  } catch {}
}

function persistKycState() {
  try {
    sessionStorage.setItem(KYC_STORAGE_KEY, JSON.stringify({
      screen: kycState.screen,
      kycStatus: kycState.kycStatus,
      idVerificationStatus: kycState.idVerificationStatus,
      selfieVerificationStatus: kycState.selfieVerificationStatus,
      documentType: kycState.documentType,
      documentNumber: kycState.documentNumber,
      verifiedFullName: kycState.verifiedFullName,
      verifiedDateOfBirth: kycState.verifiedDateOfBirth,
      verifiedDateOfBirthCanonical: kycState.verifiedDateOfBirthCanonical,
      verificationId: kycState.verificationId,
      verificationProvider: kycState.verificationProvider,
      selfieVerificationId: kycState.selfieVerificationId,
      selfieDataUrl: kycState.selfieDataUrl,
      idError: kycState.idError,
      selfieError: kycState.selfieError,
      showKycSuccessModal: kycState.showKycSuccessModal
    }));
  } catch {}
}

function getKycDocumentType() {
  return KYC_DOCUMENT_TYPES.find((item) => item.value === kycState.documentType) || null;
}

const KYC_TEST_ID_FIXTURE = {
  documentType: "NIN",
  documentNumber: "TEST-NIN-001",
  verificationStatus: "VERIFIED",
  verificationId: "demo-verification-001",
  identity: {
    fullName: "Chinedu Okonkwo",
    dateOfBirth: "1990-05-15"
  }
};

function isKycTestMode() {
  return isOutsiderTestMode();
}

function normalizeKycDocumentNumber(value) {
  return String(value || "").trim().toUpperCase();
}

function formatKycDateOfBirth(value) {
  const normalized = String(value || "").trim();
  const match = normalized.match(/^(\\d{4})-(\\d{2})-(\\d{2})$/);
  return match ? match[3] + "-" + match[2] + "-" + match[1] : normalized;
}

function getKycMockVerification(documentType, documentNumber) {
  if (!isKycTestMode()) return null;
  if (documentType !== KYC_TEST_ID_FIXTURE.documentType) return null;
  if (normalizeKycDocumentNumber(documentNumber) !== KYC_TEST_ID_FIXTURE.documentNumber) return null;
  return {
    success: true,
    status: KYC_TEST_ID_FIXTURE.verificationStatus,
    verificationId: KYC_TEST_ID_FIXTURE.verificationId,
    identity: {
      ...KYC_TEST_ID_FIXTURE.identity,
      documentType: KYC_TEST_ID_FIXTURE.documentType,
      documentNumber: KYC_TEST_ID_FIXTURE.documentNumber
    }
  };
}

function kycIsComplete() {
  return kycState.idVerificationStatus === "VERIFIED" &&
    kycState.selfieVerificationStatus === "FACE_MATCHED";
}

function kycOverviewStatus() {
  if (kycIsComplete()) return "KYC_VERIFIED";
  if (kycState.selfieVerificationStatus === "FACE_MATCHED") return "SELFIE_VERIFIED";
  if (kycState.idVerificationStatus === "VERIFIED") return "ID_VERIFIED";
  if (kycState.idVerificationStatus === "VERIFYING") return "ID_VERIFYING";
  if (kycState.selfieVerificationStatus === "CAPTURING") return "SELFIE_CAPTURING";
  return "ID_REQUIRED";
}

const KYC_HERO_URL = window.__OUTSIDER_KYC_HERO_URL__ || "";

function KycHeader(backAction = "overview") {
  return '<header class="kyc-header">' +
    '<button class="kyc-nav-button" type="button" data-kyc-back="' + escapeHtml(backAction) + '" aria-label="Back">' +
      '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M14.5 5.5 8 12l6.5 6.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
    '</button>' +
    '<h1>Update KYC</h1>' +
    '<span class="kyc-header-right-spacer" aria-hidden="true"></span>' +
  '</header>';
}

function KycHero() {
  return KYC_HERO_URL ? '<div class="kyc-hero" aria-hidden="true"><img class="kyc-hero-image" src="' + escapeHtml(KYC_HERO_URL) + '" alt="" draggable="false" /></div>' : '<div class="kyc-hero" aria-hidden="true"></div>';
}

function KycCheckIcon() {
  return '<span class="kyc-success-check" aria-label="Verified"><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="7" fill="#00C875"/><path d="m6.8 10 2.1 2.1 4.5-4.5" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>';
}

function KycRow(icon, title, description, complete, action) {
  return '<button class="kyc-verification-row" type="button" data-kyc-action="' + action + '">' +
    '<span class="kyc-row-icon">' + icon + '</span>' +
    '<span class="kyc-row-copy"><strong>' + title + '</strong><span>' + description + '</span></span>' +
    '<span class="kyc-row-state">' + (complete ? KycCheckIcon() : '<svg class="kyc-row-chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m9 5 7 7-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>') + '</span>' +
  '</button>';
}

function KycIdIcon() {
  return '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="9" r="2.3" stroke="currentColor" stroke-width="1.5"/><path d="M8 16h8M9.5 13.5h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
}

function KycCameraIcon() {
  return '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 8.5h3l1.5-2h5L16 8.5h3a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18v-8A1.5 1.5 0 0 1 5 8.5Z" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="14" r="3" stroke="currentColor" stroke-width="1.7"/></svg>';
}

function KycSuccessModal() {
  if (!kycState.showKycSuccessModal) return "";
  return '<div class="kyc-success-modal" role="dialog" aria-modal="true" aria-labelledby="kyc-success-title">' +
    '<div class="kyc-success-scrim" data-kyc-success-scrim></div>' +
    '<button class="kyc-success-close" type="button" data-kyc-success-close aria-label="Close KYC success message"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 7 17 17M17 7 7 17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>' +
    '<section class="kyc-success-sheet">' +
      '<img class="kyc-success-badge" src="/assets/kyc/kyc-action-icon.png" alt="" aria-hidden="true">' +
      '<div class="kyc-success-content">' +
        '<h2 id="kyc-success-title">You have successfully updated<br>your KYC</h2>' +
        '<button type="button" class="kyc-success-continue" data-kyc-success-continue aria-label="Continue after KYC verification">Continue</button>' +
      '</div>' +
    '</section>' +
  '</div>';
}

function KycOverviewScreen() {
  const idComplete = kycState.idVerificationStatus === "VERIFIED";
  const selfieComplete = kycState.selfieVerificationStatus === "FACE_MATCHED";
  const canSubmit = idComplete && selfieComplete;

  return '<div class="mobile-app-shell"><main class="kyc-page">' +
    KycHeader("/onboarding/payment-method") +
    '<div class="kyc-scroll"><section class="kyc-overview-content">' +
      KycHero() +
      '<h2 class="kyc-title">Verify your Identity</h2>' +
      '<p class="kyc-description">Kindly submit the following documents to<br>verify and upgrade your account.</p>' +
      '<div class="kyc-verification-list">' +
        KycRow(KycIdIcon(), "Enter your valid ID number", "This helps to verify your personal<br>informations are correct", idComplete, "id") +
        KycRow(KycCameraIcon(), "Take a selfie of yourself", "To match the photo on your ID", selfieComplete, "selfie") +
      '</div>' +
      (kycState.selfieError ? '<p class="form-error kyc-inline-error" role="alert">' + escapeHtml(kycState.selfieError) + '</p>' : "") +
      '<button class="kyc-submit-all" type="button" data-kyc-submit-all ' + (!canSubmit || kycState.loading ? "disabled" : "") + '>' + (kycState.loading ? "Verifying..." : "Submit all") + '</button>' +
    '</section></div>' +
    KycSuccessModal() +
    '</main></div>';
}

function KycIdScreen() {
  const doc = getKycDocumentType();
  const idVerified = kycState.idVerificationStatus === "VERIFIED";
  const canSubmit = Boolean(doc && kycState.documentNumber.trim() && !kycState.loading);
  return '<div class="mobile-app-shell"><main class="kyc-page">' +
    KycHeader("overview") +
    '<div class="kyc-scroll"><section class="kyc-id-content">' +
      KycHero() +
      '<h2 class="kyc-title">Verify your ID</h2>' +
      '<p class="kyc-description">Kindly select and submit your ID number to<br>verify and upgrade your account.</p>' +
      '<div class="kyc-form">' +
        '<label class="kyc-field-label" for="kyc-document-type">Select Valid ID</label>' +
        '<div class="kyc-select-wrap"><select id="kyc-document-type" class="kyc-select" aria-label="Select Valid ID">' +
          '<option value="">Select Valid ID</option>' +
          KYC_DOCUMENT_TYPES.map((item) => '<option value="' + item.value + '" ' + (item.value === kycState.documentType ? "selected" : "") + '>' + item.label + '</option>').join("") +
        '</select><span class="kyc-select-chevron"><svg viewBox="0 0 24 24" fill="none"><path d="m7 9 5 5 5-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span></div>' +
        '<label class="kyc-field-label" for="kyc-document-number">Input ID Number</label>' +
        '<div class="kyc-input-wrap ' + (idVerified ? "is-verified" : "") + '"><input id="kyc-document-number" class="kyc-input" type="text" inputmode="numeric" autocomplete="off" placeholder="' + escapeHtml(doc?.placeholder || "00000000000") + '" value="' + escapeHtml(kycState.documentNumber) + '" ' + (idVerified ? "readonly" : "") + '>' +
          (idVerified ? KycCheckIcon() : "") + '</div>' +
        '<label class="kyc-field-label" for="kyc-dob">Date of Birth</label>' +
        '<div class="kyc-input-wrap ' + (kycState.verifiedDateOfBirth ? "is-verified" : "") + '"><input id="kyc-dob" class="kyc-input" type="text" inputmode="numeric" placeholder="00-00-0000" value="' + escapeHtml(kycState.verifiedDateOfBirth) + '" readonly>' +
          (kycState.verifiedDateOfBirth ? KycCheckIcon() : "") + '</div>' +
        (kycState.idError ? '<p class="form-error kyc-inline-error" role="alert">' + escapeHtml(kycState.idError) + '</p>' : "") +
        '<button class="kyc-submit" type="button" data-kyc-verify-id ' + (!canSubmit || idVerified ? "disabled" : "") + '>' + (kycState.loading ? "Verifying..." : "Submit") + '</button>' +
      '</div>' +
    '</section></div></main></div>';
}

function KycPermissionScreen() {
  return '<div class="mobile-app-shell"><main class="kyc-permission-screen">' +
    '<button class="kyc-camera-back" type="button" data-kyc-camera-back aria-label="Back"><svg viewBox="0 0 24 24" fill="none"><path d="m14 5-7 7 7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
    '<div class="kyc-permission-card"><div class="kyc-permission-icon">' + KycCameraIcon() + '</div><h2>Camera access required</h2><p>Camera access is required to verify your identity.</p><div class="kyc-permission-actions"><button type="button" class="kyc-permission-primary" data-kyc-allow-camera>Allow camera access</button><button type="button" class="kyc-permission-secondary" data-kyc-camera-back>Not now</button></div></div>' +
  '</main></div>';
}

function KycCameraScreen() {
  return '<div class="mobile-app-shell"><main class="kyc-camera-screen">' +
    '<video id="kyc-camera-video" class="kyc-camera-video" autoplay playsinline muted></video>' +
    '<div class="kyc-camera-overlay">' +
      '<button class="kyc-camera-back" type="button" data-kyc-camera-back aria-label="Back"><svg viewBox="0 0 24 24" fill="none"><path d="m14 5-7 7 7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
      '<div class="kyc-face-frame" aria-hidden="true"><span></span><span></span><span></span><span></span></div>' +
      '<div class="kyc-camera-guidance"><h2>' + (kycState.cameraMessage || "Center your face") + '</h2><p>Align your face properly to the box<br>Then take a photo</p></div>' +
      '<div class="kyc-camera-controls"><button type="button" class="kyc-camera-tool" aria-label="Switch camera" data-kyc-switch-camera><svg viewBox="0 0 24 24" fill="none"><path d="M7 8h8.5l-1.5-2M17 16H8.5l1.5 2M15.5 6l2 2-2 2M8.5 18l-2-2 2-2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button><button type="button" class="kyc-shutter" aria-label="Take photo" data-kyc-capture></button><button type="button" class="kyc-camera-tool" aria-label="Flash" data-kyc-flash><svg viewBox="0 0 24 24" fill="none"><path d="M13 2 5 13h6l-1 9 8-12h-6l1-8Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg></button></div>' +
    '</div>' +
  '</main></div>';
}

function KycPhotoConfirmationScreen() {
  return '<div class="mobile-app-shell"><main class="kyc-photo-confirmation">' +
    '<div class="kyc-photo-preview">' + (kycState.capturedImage ? '<img src="' + kycState.capturedImage + '" alt="Captured selfie preview">' : "") + '</div>' +
    '<div class="kyc-photo-confirmation-content"><h2>Use this photo?</h2><p>Make sure your face is clear and properly positioned.</p><div class="kyc-photo-actions"><button type="button" class="kyc-photo-retake" data-kyc-retake>Retake</button><button type="button" class="kyc-photo-use" data-kyc-use-photo>Use photo</button></div></div>' +
  '</main></div>';
}

function KycProcessingScreen() {
  return '<div class="mobile-app-shell"><main class="kyc-processing-screen"><div class="kyc-processing-spinner"></div><h2>Verifying...</h2><p>Checking your selfie, liveness and face match.</p></main></div>';
}

function KycSuccessScreen() {
  return '<div class="mobile-app-shell"><main class="kyc-success-screen">' +
    '<div class="kyc-success-scrim"></div>' +
    '<button class="kyc-success-close" type="button" data-kyc-success-close aria-label="Close"><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M7 7 17 17M17 7 7 17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>' +
    '<section class="kyc-success-sheet"><img class="kyc-success-badge" src="/assets/kyc/kyc-action-icon.png" alt="" aria-hidden="true"><div class="kyc-success-content"><h2>You have successfully updated<br>your KYC</h2><button type="button" class="kyc-success-continue" data-kyc-success-continue>Continue</button></div></section>' +
  '</main></div>';
}

function KycScreen() {
  if (kycState.screen === "id") return KycIdScreen();
  if (kycState.screen === "permission") return KycPermissionScreen();
  if (kycState.screen === "camera") return KycCameraScreen();
  if (kycState.screen === "photo-confirmation") return KycPhotoConfirmationScreen();
  if (kycState.screen === "processing") return KycProcessingScreen();
  // Success is rendered as an overlay on the final KYC screen, never as a standalone route.
  return KycOverviewScreen();
}

async function verifyKycId() {
  if (kycState.loading || kycState.idVerificationStatus === "VERIFIED") return;
  const doc = getKycDocumentType();
  const number = normalizeKycDocumentNumber(kycState.documentNumber);
  kycState.idError = "";
  if (!doc) {
    kycState.idError = "Please select a valid ID type.";
    renderKyc();
    return;
  }
  const isMockTestId = Boolean(getKycMockVerification(kycState.documentType, number));
  if (!isMockTestId && !doc.pattern.test(number)) {
    kycState.idError = "Enter a valid " + doc.label + " number.";
    renderKyc();
    return;
  }

  kycState.loading = true;
  kycState.idVerificationStatus = "VERIFYING";
  kycState.kycStatus = "ID_VERIFYING";
  renderKyc();

  try {
    const mockResponse = getKycMockVerification(kycState.documentType, number);
    if (mockResponse) {
      await new Promise((resolve) => window.setTimeout(resolve, 450));
      if (kycState.documentType !== mockResponse.identity.documentType || normalizeKycDocumentNumber(kycState.documentNumber) !== mockResponse.identity.documentNumber) {
        return;
      }
      kycState.verifiedFullName = String(mockResponse.identity?.fullName || "");
      kycState.verifiedDateOfBirthCanonical = String(mockResponse.identity?.dateOfBirth || "");
      kycState.verifiedDateOfBirth = formatKycDateOfBirth(kycState.verifiedDateOfBirthCanonical);
      kycState.verificationId = String(mockResponse.verificationId || "");
      kycState.verificationProvider = "DEVELOPMENT_MOCK_IDENTITY_PROVIDER";
    } else {
      const response = await fetch(API + "/api/kyc/verify-id", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ documentType: kycState.documentType, documentNumber: number })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success || data.status !== "VERIFIED") {
        throw new Error(data?.message || "Unable to verify your ID");
      }
      kycState.verifiedFullName = String(data.identity?.fullName || "");
      kycState.verifiedDateOfBirthCanonical = String(data.identity?.dateOfBirth || "");
      kycState.verifiedDateOfBirth = formatKycDateOfBirth(kycState.verifiedDateOfBirthCanonical);
      kycState.verificationId = String(data.verificationId || "");
      kycState.verificationProvider = String(data.provider || "");
    }
    kycState.idVerificationStatus = "VERIFIED";
    kycState.kycStatus = "ID_VERIFIED";
    kycState.idError = "";
    persistKycState();
    kycState.screen = "overview";
  } catch (error) {
    kycState.idVerificationStatus = "FAILED";
    kycState.kycStatus = "VERIFICATION_FAILED";
    kycState.idError = error instanceof Error ? error.message : "Unable to verify your ID";
  } finally {
    kycState.loading = false;
    renderKyc();
  }
}

async function startKycCamera() {
  if (kycState.cameraStarting) return;
  if (!navigator.mediaDevices?.getUserMedia) {
    kycState.cameraMessage = "Camera unavailable";
    kycState.selfieError = "Your browser does not provide camera access.";
    kycState.screen = "overview";
    renderKyc();
    return;
  }

  if (kycState.cameraPermission !== "granted") {
    kycState.screen = "permission";
    renderKyc();
    return;
  }

  kycState.screen = "camera";
  kycState.cameraMessage = "Center your face";
  kycState.cameraStarting = true;
  renderKyc();

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: kycState.cameraFacingMode, width: { ideal: 1080 }, height: { ideal: 1920 } },
      audio: false
    });
    kycState.cameraStream = stream;
    const video = document.getElementById("kyc-camera-video");
    if (video) {
      video.srcObject = stream;
      await video.play().catch(() => {});
    }
    kycState.cameraPermission = "granted";
    kycState.cameraStarting = false;
  } catch {
    kycState.cameraPermission = "denied";
    kycState.cameraStarting = false;
    kycState.selfieError = "Camera access is required. Allow camera access in your device settings to continue.";
    kycState.screen = "permission";
    renderKyc();
  }
}

async function allowKycCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: kycState.cameraFacingMode }, audio: false });
    stream.getTracks().forEach((track) => track.stop());
    kycState.cameraPermission = "granted";
    kycState.selfieError = "";
    await startKycCamera();
  } catch {
    kycState.cameraPermission = "denied";
    kycState.selfieError = "Camera access is required. Allow camera access in your device settings to continue.";
    renderKyc();
  }
}

function stopKycCamera() {
  if (kycState.cameraStream) {
    kycState.cameraStream.getTracks().forEach((track) => track.stop());
    kycState.cameraStream = null;
  }
}

async function switchKycCamera() {
  stopKycCamera();
  kycState.cameraFacingMode = kycState.cameraFacingMode === "user" ? "environment" : "user";
  await startKycCamera();
}

function captureKycSelfie() {
  const video = document.getElementById("kyc-camera-video");
  if (!video || video.readyState < 2) return;
  const canvas = document.createElement("canvas");
  const width = video.videoWidth || 720;
  const height = video.videoHeight || 1280;
  const targetWidth = Math.min(width, 720);
  const targetHeight = Math.round(height * (targetWidth / width));
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  if (kycState.cameraFacingMode === "user") {
    ctx.translate(targetWidth, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
  kycState.capturedImage = canvas.toDataURL("image/jpeg", 0.82);
  stopKycCamera();
  kycState.selfieVerificationStatus = "PROCESSING";
  kycState.screen = "photo-confirmation";
  persistKycState();
  renderKyc();
}

async function useKycPhoto() {
  if (!kycState.capturedImage || kycState.loading) return;
  kycState.loading = true;
  kycState.screen = "processing";
  kycState.selfieVerificationStatus = "PROCESSING";
  kycState.kycStatus = "FACE_MATCHING";
  renderKyc();

  try {
    if (isKycTestMode()) {
      await new Promise((resolve) => window.setTimeout(resolve, 1200));
      kycState.selfieVerificationId = "test-selfie-" + Date.now();
    } else {
      const response = await fetch(API + "/api/kyc/verify-selfie", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          verificationId: kycState.verificationId,
          selfieImage: kycState.capturedImage
        })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success || data.status !== "VERIFIED") {
        throw new Error(data?.message || "We couldn't match your selfie with your ID.");
      }
      kycState.selfieVerificationId = String(data.verificationId || "");
    }
    kycState.selfieVerificationStatus = "FACE_MATCHED";
    kycState.kycStatus = "KYC_VERIFIED";
    kycState.selfieError = "";
    persistKycState();
    kycState.screen = "overview";
  } catch (error) {
    kycState.selfieVerificationStatus = "FAILED";
    kycState.kycStatus = "VERIFICATION_FAILED";
    kycState.selfieError = error instanceof Error ? error.message : "We couldn't verify your selfie.";
    kycState.screen = "overview";
  } finally {
    kycState.loading = false;
    renderKyc();
  }
}

async function submitKycAll() {
  if (!kycIsComplete() || kycState.loading) return;
  kycState.loading = true;
  renderKyc();
  try {
    if (!isKycTestMode()) {
      const response = await fetch(API + "/api/kyc/complete", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          verificationId: kycState.verificationId,
          selfieVerificationId: kycState.selfieVerificationId
        })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) throw new Error(data?.message || "Unable to complete KYC.");
    }
    kycState.kycStatus = "KYC_VERIFIED";
    kycState.showKycSuccessModal = true;
    persistKycState();
  } catch (error) {
    kycState.selfieError = error instanceof Error ? error.message : "Unable to complete KYC.";
  } finally {
    kycState.loading = false;
    renderKyc();
  }
}

function renderKyc() {
  stopKycCamera();
  app.innerHTML = KycScreen();
  bindKycEvents();
}

function bindKycEvents() {
  document.querySelectorAll("[data-kyc-back]").forEach((button) => {
    button.addEventListener("click", () => {
      stopKycCamera();
      const target = button.dataset.kycBack;
      if (target === "/onboarding/payment-method") {
        window.location.href = target;
        return;
      }
      kycState.screen = "overview";
      kycState.idError = "";
      kycState.selfieError = "";
      renderKyc();
    });
  });

  document.querySelectorAll("[data-kyc-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const action = button.dataset.kycAction;
      if (action === "id") {
        kycState.screen = "id";
        renderKyc();
      } else if (action === "selfie") {
        if (kycState.idVerificationStatus !== "VERIFIED") {
          kycState.selfieError = "Complete ID verification before taking a selfie.";
          renderKyc();
          return;
        }
        await startKycCamera();
      }
    });
  });

  document.getElementById("kyc-document-type")?.addEventListener("change", (event) => {
    kycState.documentType = event.target.value;
    kycState.documentNumber = "";
    kycState.idVerificationStatus = "UNVERIFIED";
    kycState.kycStatus = "NOT_STARTED";
    kycState.verifiedFullName = "";
    kycState.verifiedDateOfBirth = "";
    kycState.verifiedDateOfBirthCanonical = "";
    kycState.verificationId = "";
    kycState.verificationProvider = "";
    kycState.loading = false;
    kycState.idError = "";
    persistKycState();
    renderKyc();
  });

  document.getElementById("kyc-document-number")?.addEventListener("input", async (event) => {
    const nextNumber = String(event.target.value || "").replace(/\s+/g, "");
    const normalizedNumber = normalizeKycDocumentNumber(nextNumber);
    const changed = normalizedNumber !== normalizeKycDocumentNumber(kycState.documentNumber);
    kycState.documentNumber = nextNumber;
    kycState.idError = "";

    if (changed && kycState.idVerificationStatus !== "UNVERIFIED") {
      kycState.idVerificationStatus = "UNVERIFIED";
      kycState.kycStatus = "NOT_STARTED";
      kycState.verifiedFullName = "";
      kycState.verifiedDateOfBirth = "";
      kycState.verifiedDateOfBirthCanonical = "";
      kycState.verificationId = "";
      kycState.verificationProvider = "";
      kycState.loading = false;
    } else if (changed && kycState.verifiedDateOfBirth) {
      kycState.verifiedFullName = "";
      kycState.verifiedDateOfBirth = "";
      kycState.verifiedDateOfBirthCanonical = "";
      kycState.verificationId = "";
      kycState.verificationProvider = "";
    }

    persistKycState();
    if (kycState.documentType === "NIN" && normalizedNumber === KYC_TEST_ID_FIXTURE.documentNumber && isKycTestMode() && !kycState.loading) {
      await verifyKycId();
    }
  });

  document.querySelector("[data-kyc-verify-id]")?.addEventListener("click", verifyKycId);

  document.querySelector("[data-kyc-allow-camera]")?.addEventListener("click", allowKycCamera);
  document.querySelectorAll("[data-kyc-camera-back]").forEach((button) => {
    button.addEventListener("click", () => {
      stopKycCamera();
      kycState.screen = "overview";
      renderKyc();
    });
  });
  document.querySelector("[data-kyc-switch-camera]")?.addEventListener("click", switchKycCamera);
  document.querySelector("[data-kyc-capture]")?.addEventListener("click", captureKycSelfie);
  document.querySelector("[data-kyc-retake]")?.addEventListener("click", async () => {
    kycState.capturedImage = "";
    kycState.selfieVerificationStatus = "CAPTURING";
    await startKycCamera();
  });
  document.querySelector("[data-kyc-use-photo]")?.addEventListener("click", useKycPhoto);
  document.querySelector("[data-kyc-submit-all]")?.addEventListener("click", submitKycAll);

  document.querySelector("[data-kyc-success-close]")?.addEventListener("click", () => {
    kycState.showKycSuccessModal = false;
    persistKycState();
    renderKyc();
  });
  document.querySelector("[data-kyc-success-continue]")?.addEventListener("click", () => {
    kycState.showKycSuccessModal = false;
    kycState.kycStatus = "KYC_VERIFIED";
    persistKycState();
    completeOutsiderTestOnboarding();
    window.location.href = "/home";
  });

  if (kycState.screen === "camera") {
    const video = document.getElementById("kyc-camera-video");
    if (video && kycState.cameraStream) {
      video.srcObject = kycState.cameraStream;
      void video.play().catch(() => {});
    } else {
      void startKycCamera();
    }
  }
}

const PAYMENT_PROVIDERS = {
  MOBILE_MONEY: [
    { value: "ACCESS_BANK", label: "Access Bank", providerType: "commercial_bank", group: "Commercial Banks", identifierType: "ACCOUNT_NUMBER", identifierLabel: "Account Number", identifierPlaceholder: "Enter account number", requiresAccountHolderName: true, aliases: ["access"] },
    { value: "CITIBANK_NIGERIA", label: "Citibank Nigeria", providerType: "commercial_bank", group: "Commercial Banks", identifierType: "ACCOUNT_NUMBER", identifierLabel: "Account Number", identifierPlaceholder: "Enter account number", requiresAccountHolderName: true, aliases: ["citi", "citibank"] },
    { value: "ECOBANK", label: "Ecobank", providerType: "commercial_bank", group: "Commercial Banks", identifierType: "ACCOUNT_NUMBER", identifierLabel: "Account Number", identifierPlaceholder: "Enter account number", requiresAccountHolderName: true, aliases: ["eco"] },
    { value: "FIDELITY_BANK", label: "Fidelity Bank", providerType: "commercial_bank", group: "Commercial Banks", identifierType: "ACCOUNT_NUMBER", identifierLabel: "Account Number", identifierPlaceholder: "Enter account number", requiresAccountHolderName: true, aliases: ["fidelity"] },
    { value: "FIRST_BANK", label: "First Bank", providerType: "commercial_bank", group: "Commercial Banks", identifierType: "ACCOUNT_NUMBER", identifierLabel: "Account Number", identifierPlaceholder: "Enter account number", requiresAccountHolderName: true, aliases: ["firstbank"] },
    { value: "FCMB", label: "FCMB", providerType: "commercial_bank", group: "Commercial Banks", identifierType: "ACCOUNT_NUMBER", identifierLabel: "Account Number", identifierPlaceholder: "Enter account number", requiresAccountHolderName: true, aliases: ["first city monument"] },
    { value: "GTBANK", label: "GTBank", providerType: "commercial_bank", group: "Commercial Banks", identifierType: "ACCOUNT_NUMBER", identifierLabel: "Account Number", identifierPlaceholder: "Enter account number", requiresAccountHolderName: true, aliases: ["gt", "gtb"] },
    { value: "GLOBUS_BANK", label: "Globus Bank", providerType: "commercial_bank", group: "Commercial Banks", identifierType: "ACCOUNT_NUMBER", identifierLabel: "Account Number", identifierPlaceholder: "Enter account number", requiresAccountHolderName: true, aliases: ["globus"] },
    { value: "KEYSTONE_BANK", label: "Keystone Bank", providerType: "commercial_bank", group: "Commercial Banks", identifierType: "ACCOUNT_NUMBER", identifierLabel: "Account Number", identifierPlaceholder: "Enter account number", requiresAccountHolderName: true, aliases: ["keystone"] },
    { value: "POLARIS_BANK", label: "Polaris Bank", providerType: "commercial_bank", group: "Commercial Banks", identifierType: "ACCOUNT_NUMBER", identifierLabel: "Account Number", identifierPlaceholder: "Enter account number", requiresAccountHolderName: true, aliases: ["polaris"] },
    { value: "STANBIC_IBTC", label: "Stanbic IBTC", providerType: "commercial_bank", group: "Commercial Banks", identifierType: "ACCOUNT_NUMBER", identifierLabel: "Account Number", identifierPlaceholder: "Enter account number", requiresAccountHolderName: true, aliases: ["stanbic", "ibtc"] },
    { value: "STERLING_BANK", label: "Sterling Bank", providerType: "commercial_bank", group: "Commercial Banks", identifierType: "ACCOUNT_NUMBER", identifierLabel: "Account Number", identifierPlaceholder: "Enter account number", requiresAccountHolderName: true, aliases: ["sterling"] },
    { value: "UBA", label: "UBA", providerType: "commercial_bank", group: "Commercial Banks", identifierType: "ACCOUNT_NUMBER", identifierLabel: "Account Number", identifierPlaceholder: "Enter account number", requiresAccountHolderName: true, aliases: ["united bank for africa"] },
    { value: "UNION_BANK", label: "Union Bank", providerType: "commercial_bank", group: "Commercial Banks", identifierType: "ACCOUNT_NUMBER", identifierLabel: "Account Number", identifierPlaceholder: "Enter account number", requiresAccountHolderName: true, aliases: ["union"] },
    { value: "WEMA_BANK", label: "Wema Bank", providerType: "commercial_bank", group: "Commercial Banks", identifierType: "ACCOUNT_NUMBER", identifierLabel: "Account Number", identifierPlaceholder: "Enter account number", requiresAccountHolderName: true, aliases: ["wema", "alats"] },
    { value: "ZENITH_BANK", label: "Zenith Bank", providerType: "commercial_bank", group: "Commercial Banks", identifierType: "ACCOUNT_NUMBER", identifierLabel: "Account Number", identifierPlaceholder: "Enter account number", requiresAccountHolderName: true, aliases: ["zenith", "zen"] },
    { value: "NINE_PSB", label: "9PSB", providerType: "payment_service_bank", group: "Digital / Payment Service Banks", identifierType: "ACCOUNT_NUMBER", identifierLabel: "Account Number", identifierPlaceholder: "Enter account number", requiresAccountHolderName: true, aliases: ["9psb"] },
    { value: "HOPE_PSB", label: "Hope PSB", providerType: "payment_service_bank", group: "Digital / Payment Service Banks", identifierType: "ACCOUNT_NUMBER", identifierLabel: "Account Number", identifierPlaceholder: "Enter account number", requiresAccountHolderName: true, aliases: ["hope"] },
    { value: "MONEYMABSTER_PSB", label: "MoneyMaster PSB", providerType: "payment_service_bank", group: "Digital / Payment Service Banks", identifierType: "ACCOUNT_NUMBER", identifierLabel: "Account Number", identifierPlaceholder: "Enter account number", requiresAccountHolderName: true, aliases: ["moneymaster"] },
    { value: "MOMO_PSB", label: "MoMo PSB", providerType: "payment_service_bank", group: "Digital / Payment Service Banks", identifierType: "PHONE_NUMBER", identifierLabel: "Phone Number", identifierPlaceholder: "Enter phone number", requiresAccountHolderName: true, aliases: ["momo"] },
    { value: "SMARTCASH", label: "SmartCash", providerType: "payment_service_bank", group: "Digital / Payment Service Banks", identifierType: "PHONE_NUMBER", identifierLabel: "Phone Number", identifierPlaceholder: "Enter phone number", requiresAccountHolderName: true, aliases: ["smart cash"] },
    { value: "OPAY", label: "OPay", providerType: "mobile_money", group: "Digital / Mobile Payment", identifierType: "ACCOUNT_OR_PHONE", identifierLabel: "Account Number / Phone Number", identifierPlaceholder: "Enter account number or phone number", requiresAccountHolderName: true, aliases: ["opay"] },
    { value: "MONIEPOINT", label: "Moniepoint", providerType: "digital_bank", group: "Digital / Mobile Payment", identifierType: "ACCOUNT_NUMBER", identifierLabel: "Account Number", identifierPlaceholder: "Enter account number", requiresAccountHolderName: true, aliases: ["mon"] },
    { value: "PALMPAY", label: "PalmPay", providerType: "digital_bank", group: "Digital / Mobile Payment", identifierType: "ACCOUNT_OR_PHONE", identifierLabel: "Account Number / Phone Number", identifierPlaceholder: "Enter account number or phone number", requiresAccountHolderName: true, aliases: ["palm", "palmpay"] },
    { value: "PAGA", label: "Paga", providerType: "payment_platform", group: "Digital / Mobile Payment", identifierType: "PHONE_NUMBER", identifierLabel: "Phone Number", identifierPlaceholder: "Enter phone number", requiresAccountHolderName: true, aliases: ["paga"] },
    { value: "KUDA", label: "Kuda", providerType: "digital_bank", group: "Digital / Mobile Payment", identifierType: "ACCOUNT_NUMBER", identifierLabel: "Account Number", identifierPlaceholder: "Enter account number", requiresAccountHolderName: true, aliases: ["kuda"] },
    { value: "FAIRMONEY", label: "FairMoney", providerType: "payment_platform", group: "Digital / Mobile Payment", identifierType: "ACCOUNT_OR_PHONE", identifierLabel: "Account Number / Phone Number", identifierPlaceholder: "Enter account number or phone number", requiresAccountHolderName: true, aliases: ["fairmoney", "fair money"] },
    { value: "JAIZ_BANK", label: "Jaiz Bank", providerType: "non_interest_bank", group: "Non-Interest Banks", identifierType: "ACCOUNT_NUMBER", identifierLabel: "Account Number", identifierPlaceholder: "Enter account number", requiresAccountHolderName: true, aliases: ["jaiz"] },
    { value: "LOTUS_BANK", label: "Lotus Bank", providerType: "non_interest_bank", group: "Non-Interest Banks", identifierType: "ACCOUNT_NUMBER", identifierLabel: "Account Number", identifierPlaceholder: "Enter account number", requiresAccountHolderName: true, aliases: ["lotus"] },
    { value: "SUMMIT_BANK", label: "Summit Bank", providerType: "non_interest_bank", group: "Non-Interest Banks", identifierType: "ACCOUNT_NUMBER", identifierLabel: "Account Number", identifierPlaceholder: "Enter account number", requiresAccountHolderName: true, aliases: ["summit"] },
    { value: "TAJBANK", label: "TAJBank", providerType: "non_interest_bank", group: "Non-Interest Banks", identifierType: "ACCOUNT_NUMBER", identifierLabel: "Account Number", identifierPlaceholder: "Enter account number", requiresAccountHolderName: true, aliases: ["taj", "tajbank"] },
    { value: "ALTERNATIVE_BANK", label: "The Alternative Bank", providerType: "non_interest_bank", group: "Non-Interest Banks", identifierType: "ACCOUNT_NUMBER", identifierLabel: "Account Number", identifierPlaceholder: "Enter account number", requiresAccountHolderName: true, aliases: ["alternative bank"] }
  ],
  EMAIL_PAYMENT: [
    { value: "PAYPAL", label: "PayPal", providerType: "international_payment_platform", group: "Payment Platforms", identifierType: "EMAIL", identifierLabel: "Email Address", identifierPlaceholder: "Enter PayPal email", requiresAccountHolderName: true, aliases: ["paypal"] },
    { value: "PAYONEER", label: "Payoneer", providerType: "international_payment_platform", group: "Payment Platforms", identifierType: "EMAIL", identifierLabel: "Email Address", identifierPlaceholder: "Enter Payoneer email", requiresAccountHolderName: true, aliases: ["payoneer"] },
    { value: "STRIPE", label: "Stripe", providerType: "international_payment_platform", group: "Payment Platforms", identifierType: "EMAIL", identifierLabel: "Email Address", identifierPlaceholder: "Enter Stripe email", requiresAccountHolderName: true, aliases: ["stripe"] },
    { value: "SKRILL", label: "Skrill", providerType: "international_payment_platform", group: "Payment Platforms", identifierType: "EMAIL", identifierLabel: "Email Address", identifierPlaceholder: "Enter Skrill email", requiresAccountHolderName: true, aliases: ["skrill"] },
    { value: "WISE", label: "Wise", providerType: "international_payment_platform", group: "Payment Platforms", identifierType: "EMAIL", identifierLabel: "Email Address", identifierPlaceholder: "Enter Wise email", requiresAccountHolderName: true, aliases: ["wise"] },
    { value: "FLUTTERWAVE", label: "Flutterwave", providerType: "payment_platform", group: "Payment Platforms", identifierType: "EMAIL", identifierLabel: "Email Address", identifierPlaceholder: "Enter Flutterwave email", requiresAccountHolderName: true, aliases: ["flutterwave"] },
    { value: "PAYSTACK", label: "Paystack", providerType: "payment_platform", group: "Payment Platforms", identifierType: "EMAIL", identifierLabel: "Email Address", identifierPlaceholder: "Enter Paystack email", requiresAccountHolderName: true, aliases: ["paystack"] },
    { value: "REMITA", label: "Remita", providerType: "payment_platform", group: "Payment Platforms", identifierType: "EMAIL", identifierLabel: "Email Address", identifierPlaceholder: "Enter Remita email", requiresAccountHolderName: true, aliases: ["remita"] },
    { value: "INTERSWITCH", label: "Interswitch", providerType: "payment_platform", group: "Payment Platforms", identifierType: "EMAIL", identifierLabel: "Email Address", identifierPlaceholder: "Enter Interswitch email", requiresAccountHolderName: true, aliases: ["interswitch"] }
  ]
};

const SIGNUP_COUNTRIES_DATA_URL =
  "https://gist.githubusercontent.com/angusjf/cb53d2adabd072331a5aedb05c86cc54/raw/cb35e9b5be622306d1e7d2815d65c44eb5dff633/countryFlagsNamesAndDialCodes.json";

const nigeriaCountry = {
  name: "Nigeria",
  isoCode: "NG",
  callingCode: "+234",
  flag: "🇳🇬"
};

let signupCountries = [nigeriaCountry];

const signupState = {
  identifierMode: "email",
  email: "",
  selectedCountry: signupCountries[0],
  selectedCountryCode: signupCountries[0].callingCode,
  phoneNumber: "",
  username: "",
  password: "",
  confirmPassword: "",
  showPassword: false,
  showConfirmPassword: false,
  countrySelectorOpen: false,
  countrySearch: "",
  countriesLoading: false,
  countriesLoaded: false,
  countriesError: false,
  loading: false,
  error: "",
  validation: {
    identifier: "",
    username: "",
    password: "",
    confirmPassword: ""
  }
};

function getSignupIdentifierValue() {
  return signupState.identifierMode === "email"
    ? signupState.email
    : signupState.phoneNumber;
}

function normalizePhoneNumber(value) {
  return String(value || "").replace(/[^0-9]/g, "");
}

function formatPhoneNumber(value) {
  const digits = normalizePhoneNumber(value);

  if (!digits) {
    return "";
  }

  if (signupState.selectedCountry.isoCode === "NG" && digits.length <= 10) {
    const parts = [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 10)];
    return parts.filter(Boolean).join(" ");
  }

  const parts = [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 15)];
  return parts.filter(Boolean).join(" ");
}

function isValidMobileNumber(country, value) {
  const digits = normalizePhoneNumber(value);

  if (!country || !digits) {
    return false;
  }

  if (country.isoCode === "NG") {
    return /^[789]\d{9}$/.test(digits);
  }

  if (country.isoCode === "US" || country.isoCode === "CA") {
    return /^\d{10}$/.test(digits);
  }

  if (country.isoCode === "GB") {
    return /^\d{10}$/.test(digits);
  }

  if (country.isoCode === "GH" || country.isoCode === "KE") {
    return /^\d{9}$/.test(digits);
  }

  return /^\d{6,15}$/.test(digits);
}

function getCanonicalPhoneNumber() {
  return signupState.selectedCountryCode + normalizePhoneNumber(signupState.phoneNumber);
}

function setSignupIdentifierValue(value) {
  if (signupState.identifierMode === "email") {
    signupState.email = value;
  } else {
    signupState.phoneNumber = normalizePhoneNumber(value);
  }
}

function countryFlagFromIso(isoCode) {
  return String(isoCode || "")
    .toUpperCase()
    .replace(/./g, (letter) =>
      String.fromCodePoint(127397 + letter.charCodeAt(0))
    );
}

async function loadSignupCountries() {
  if (
    signupState.countriesLoaded ||
    signupState.countriesLoading
  ) {
    return;
  }

  signupState.countriesLoading = true;
  signupState.countriesError = false;
  renderSignup();

  try {
    const response = await fetch(
      SIGNUP_COUNTRIES_DATA_URL,
      {
        method: "GET",
        headers: {
          Accept: "application/json"
        }
      }
    );

    if (!response.ok) {
      throw new Error("Unable to load country data");
    }

    const data = await response.json();

    const countries = Object.entries(data)
      .map(([isoCode, country]) => ({
        name: String(country?.name || "").trim(),
        isoCode: isoCode.toUpperCase(),
        callingCode: String(country?.dialCode || "").trim(),
        flag:
          String(country?.flag || "").trim() ||
          countryFlagFromIso(isoCode)
      }))
      .filter(
        (country) =>
          country.name &&
          country.callingCode
      )
      .sort((a, b) => {
        if (a.isoCode === "NG") return -1;
        if (b.isoCode === "NG") return 1;
        return a.name.localeCompare(b.name);
      });

    if (!countries.length) {
      throw new Error("Country data is empty");
    }

    signupCountries = countries;
    signupState.countriesLoaded = true;

    const selected = signupCountries.find(
      (country) =>
        country.isoCode ===
        signupState.selectedCountry.isoCode
    );

    if (selected) {
      signupState.selectedCountry = selected;
      signupState.selectedCountryCode =
        selected.callingCode;
    }
  } catch {
    signupState.countriesError = true;
  } finally {
    signupState.countriesLoading = false;
    renderSignup();
  }
}

function getFilteredSignupCountries() {
  const query = signupState.countrySearch.trim().toLowerCase();

  if (!query) {
    return signupCountries;
  }

  return signupCountries.filter((country) =>
    (country.name + " " + country.isoCode + " " + country.callingCode)
      .toLowerCase()
      .includes(query)
  );
}

function positionSignupCountryDropdown() {
  if (!signupState.countrySelectorOpen) {
    return;
  }

  const button = document.getElementById("signup-country-button");
  const dropdown = document.getElementById("signup-country-dropdown");

  if (!button || !dropdown) {
    return;
  }

  const field = button.closest(".signup-phone-field");
  const rect = field?.getBoundingClientRect();

  if (!rect) {
    return;
  }

  const viewportPadding = 15;
  const preferredMaxHeight = 300;
  const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
  const spaceAbove = rect.top - viewportPadding;
  const openAbove = spaceBelow < 220 && spaceAbove > spaceBelow;
  const availableHeight = Math.max(180, Math.min(preferredMaxHeight, openAbove ? spaceAbove : spaceBelow));

  dropdown.style.left = Math.round(rect.left) + "px";
  dropdown.style.width = Math.round(rect.width) + "px";
  dropdown.style.maxHeight = Math.round(availableHeight) + "px";

  if (openAbove) {
    dropdown.style.top = Math.round(rect.top - availableHeight - 6) + "px";
    dropdown.style.transformOrigin = "bottom center";
  } else {
    dropdown.style.top = Math.round(rect.bottom) + "px";
    dropdown.style.transformOrigin = "top center";
  }
}

function SignupPasswordToggle({ id, visible, label }) {
  return `
    <button
      class="signup-password-toggle"
      id="${id}"
      type="button"
      aria-label="${visible ? label.hide : label.show}"
    >
      ${visible ? `
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M2.7 12s3.4-5 9.3-5 9.3 5 9.3 5-3.4 5-9.3 5-9.3-5-9.3-5Z"
            stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="12" cy="12" r="2.2" stroke="currentColor" stroke-width="1.7"/>
        </svg>
      ` : `
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M2.7 12s3.4-5 9.3-5 9.3 5 9.3 5-3.4 5-9.3 5-9.3-5-9.3-5Z"
            stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="12" cy="12" r="2.2" stroke="currentColor" stroke-width="1.7"/>
          <path d="M4.5 4.5L19.5 19.5"
            stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
        </svg>
      `}
    </button>
  `;
}

function SignupPasswordInput({ confirm = false }) {
  const visible = confirm
    ? signupState.showConfirmPassword
    : signupState.showPassword;

  const value = confirm
    ? signupState.confirmPassword
    : signupState.password;

  const error = confirm
    ? signupState.validation.confirmPassword
    : signupState.validation.password;

  const inputId = confirm ? "signup-confirm-password" : "signup-password";
  const errorId = confirm ? "signup-confirm-password-error" : "signup-password-error";

  return `
    <div class="signup-field">
      <label class="field-label signup-label" for="${inputId}">
        ${confirm ? "Confirm Password" : "Enter Password"}
      </label>

      <div class="signup-password-field">
        <input
          class="text-input signup-input signup-password-input"
          id="${inputId}"
          name="${inputId}"
          type="${visible ? "text" : "password"}"
          autocomplete="${confirm ? "new-password" : "new-password"}"
          placeholder="${confirm ? "Re-enter password" : "Create password"}"
          value="${escapeHtml(value)}"
          aria-invalid="${error ? "true" : "false"}"
          ${error ? `aria-describedby="${errorId}"` : ""}
          required
        >
        ${SignupPasswordToggle({
          id: confirm ? "signup-confirm-password-toggle" : "signup-password-toggle",
          visible,
          label: confirm
            ? {
                show: "Show confirmation password",
                hide: "Hide confirmation password"
              }
            : {
                show: "Show password",
                hide: "Hide password"
              }
        })}
      </div>

      ${error
        ? `<p class="field-error" id="${errorId}">${escapeHtml(error)}</p>`
        : ""}
    </div>
  `;
}

function SignupScreen() {
  const emailMode = signupState.identifierMode === "email";
  const identifierValue = getSignupIdentifierValue();

  return `
    <div class="mobile-app-shell">
      <div class="signup-page">
        <div class="signup-scroll">
          <main class="signup-content">
            <button class="back-button" id="signup-back-button" type="button" aria-label="Back">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M14.5 5.5L8 12L14.5 18.5"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"/>
              </svg>
            </button>

            <header class="login-header signup-header">
              <h1 class="login-title">Create account</h1>
              <p class="login-subtitle">Signup to continue</p>
            </header>

            <form class="signup-form" id="signup-form" novalidate>
              <div class="login-method-row">
                <label class="field-label" for="signup-identifier">
                  ${emailMode ? "Email Address" : "Mobile Number"}
                </label>

                <button
                  class="method-toggle"
                  id="signup-method-toggle"
                  type="button"
                  aria-label="${emailMode ? "Switch to mobile number registration" : "Switch to email registration"}"
                >
                  ${emailMode ? "Mobile Number?" : "Email Address?"}
                </button>
              </div>

              ${emailMode ? `
                <div class="input-wrap">
                  <input
                    class="text-input signup-input"
                    id="signup-identifier"
                    name="email"
                    type="email"
                    inputmode="email"
                    autocomplete="email"
                    placeholder="Enter email address"
                    value="${escapeHtml(signupState.email)}"
                    aria-invalid="${signupState.validation.identifier ? "true" : "false"}"
                    ${signupState.validation.identifier ? 'aria-describedby="signup-identifier-error"' : ""}
                    required
                  >
                </div>
              ` : `
                <div class="signup-phone-anchor">
                  <div class="signup-phone-field" aria-label="Mobile Number" aria-invalid="${signupState.validation.identifier ? "true" : "false"}">
                  <button
                    class="signup-country-button"
                    id="signup-country-button"
                    type="button"
                    aria-label="Select country code. ${escapeHtml(signupState.selectedCountry.name)}, ${escapeHtml(signupState.selectedCountryCode)}"
                    aria-expanded="${signupState.countrySelectorOpen ? "true" : "false"}"
                  >
                    <span class="signup-country-code">${escapeHtml(signupState.selectedCountryCode)}</span>
                    <svg class="signup-country-chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M7 10l5 5 5-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </button>

                  <span class="signup-phone-divider" aria-hidden="true"></span>

                  <input
                    class="signup-phone-input"
                    id="signup-identifier"
                    name="phone"
                    type="tel"
                    inputmode="tel"
                    autocomplete="tel"
                    placeholder="000 000 000"
                    value="${escapeHtml(formatPhoneNumber(signupState.phoneNumber))}"
                    aria-label="Mobile Number"
                    aria-invalid="${signupState.validation.identifier ? "true" : "false"}"
                    ${signupState.validation.identifier ? 'aria-describedby="signup-identifier-error"' : ""}
                    required
                  >
                </div>
              </div>
              `}

              ${signupState.countrySelectorOpen ? `
                <div class="signup-country-dropdown" id="signup-country-dropdown">
                    <!-- Inline dropdown -->

                    <div class="signup-country-search-wrap">
                      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="1.8"/>
                        <path d="M16 16l4.2 4.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                      </svg>
                      <input
                        id="signup-country-search"
                        class="signup-country-search"
                        type="search"
                        placeholder="Search country"
                        value="${escapeHtml(signupState.countrySearch)}"
                        autocomplete="off"
                        aria-label="Search country"
                      >
                    </div>

                    <div class="signup-country-list" id="signup-country-list">
                      ${signupState.countriesLoading
                        ? '<p class="signup-country-empty">Loading countries...</p>'
                        : signupState.countriesError
                          ? '<p class="signup-country-empty">Unable to load countries. Please try again.</p>'
                          : getFilteredSignupCountries().map((country) => `
                              <button
                                class="signup-country-option ${country.isoCode === signupState.selectedCountry.isoCode && country.callingCode === signupState.selectedCountryCode ? "is-selected" : ""}"
                                type="button"
                                data-country-iso="${country.isoCode}"
                                aria-label="${escapeHtml(country.name)}, ${escapeHtml(country.callingCode)}"
                                aria-pressed="${country.isoCode === signupState.selectedCountry.isoCode && country.callingCode === signupState.selectedCountryCode ? "true" : "false"}"
                              >
                                <span class="signup-country-option-main">
                                  <span class="signup-country-flag" aria-hidden="true">${country.flag}</span>
                                  <span class="signup-country-name">${escapeHtml(country.name)}</span>
                                </span>
                                <span class="signup-country-option-code">
                                  ${escapeHtml(country.callingCode)}
                                  ${country.isoCode === signupState.selectedCountry.isoCode && country.callingCode === signupState.selectedCountryCode ? '<span class="signup-country-check" aria-hidden="true">✓</span>' : ""}
                                </span>
                              </button>
                            `).join("") || '<p class="signup-country-empty">No countries found</p>'}
                    </div>
                </div>
              ` : ""}

              ${signupState.validation.identifier
                ? `<p class="field-error" id="signup-identifier-error">${escapeHtml(signupState.validation.identifier)}</p>`
                : ""}

              <div class="signup-field">
                <label class="field-label signup-label" for="signup-username">Username</label>
                <input
                  class="text-input signup-input"
                  id="signup-username"
                  name="username"
                  type="text"
                  autocomplete="username"
                  placeholder="Enter username"
                  value="${escapeHtml(signupState.username)}"
                  aria-invalid="${signupState.validation.username ? "true" : "false"}"
                  ${signupState.validation.username ? 'aria-describedby="signup-username-error"' : ""}
                  required
                >
                ${signupState.validation.username
                  ? `<p class="field-error" id="signup-username-error">${escapeHtml(signupState.validation.username)}</p>`
                  : ""}
              </div>

              ${SignupPasswordInput({ confirm: false })}
              ${SignupPasswordInput({ confirm: true })}

              ${signupState.error
                ? `<p class="form-error" id="signup-form-error" role="alert">${escapeHtml(signupState.error)}</p>`
                : ""}

              <button
                class="signup-submit"
                id="signup-submit"
                type="submit"
                ${signupState.loading ? "disabled" : ""}
              >
                ${signupState.loading
                  ? '<span class="login-spinner" aria-hidden="true"></span><span>Signing up...</span>'
                  : "Sign up"}
              </button>
            </form>

            <div class="signup-login-prompt">
              <span>Already have an account</span>
              <a class="signup-login-link" href="/login">Login</a>
            </div>
          </main>
        </div>
      </div>
    </div>
  `;
}

function SetupBusinessScreen() {
  const selected = onboardingBusinessState.vendorType;

  return `
    <div class="mobile-app-shell">
      <div class="setup-business-page">
        <div class="setup-business-scroll">
          <main class="setup-business-content">
            <button class="back-button" id="setup-business-back" type="button" aria-label="Back">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M14.5 5.5L8 12L14.5 18.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>

            <header class="setup-business-header">
              <h1 class="login-title">Setup your business</h1>
              <p class="login-subtitle">Let’s know more about your business</p>
            </header>

            <form id="setup-business-form" class="setup-business-form" novalidate>
              <div class="setup-business-field">
                <label class="field-label setup-business-label" for="business-name">Enter Business Name</label>
                <input
                  class="text-input setup-business-input"
                  id="business-name"
                  name="business-name"
                  type="text"
                  autocomplete="organization"
                  placeholder="Enter business name"
                  value="${escapeHtml(onboardingBusinessState.businessName)}"
                  aria-invalid="${onboardingBusinessState.validation.businessName ? "true" : "false"}"
                  ${onboardingBusinessState.validation.businessName ? 'aria-describedby="business-name-error"' : ""}
                  required
                >
                ${onboardingBusinessState.validation.businessName
                  ? `<p class="field-error" id="business-name-error">${escapeHtml(onboardingBusinessState.validation.businessName)}</p>`
                  : ""}
              </div>

              <div class="setup-business-field">
                <label class="field-label setup-business-label" for="business-location">Enter Business Location</label>
                <div class="setup-business-location-wrap">
                  <input
                    class="text-input setup-business-input setup-business-location-input"
                    id="business-location"
                    name="business-location"
                    type="text"
                    autocomplete="street-address"
                    placeholder="Enter business location"
                    value="${escapeHtml(onboardingBusinessState.businessLocation)}"
                    aria-invalid="${onboardingBusinessState.validation.businessLocation ? "true" : "false"}"
                    ${onboardingBusinessState.validation.businessLocation ? 'aria-describedby="business-location-error"' : ""}
                    required
                  >
                  <span class="setup-business-location-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none">
                      <path d="M12 21s6-5.25 6-11a6 6 0 1 0-12 0c0 5.75 6 11 6 11Z" stroke="currentColor" stroke-width="2"/>
                      <circle cx="12" cy="10" r="2" fill="currentColor"/>
                    </svg>
                  </span>
                </div>
                ${onboardingBusinessState.validation.businessLocation
                  ? `<p class="field-error" id="business-location-error">${escapeHtml(onboardingBusinessState.validation.businessLocation)}</p>`
                  : ""}
              </div>

              <fieldset class="setup-business-field setup-business-vendor-group">
                <legend class="field-label setup-business-label">Select vendor option</legend>

                <button class="setup-business-option ${selected === "SINGLE_VENDOR" ? "is-selected" : ""}"
                  type="button" data-vendor-type="SINGLE_VENDOR" role="radio"
                  aria-checked="${selected === "SINGLE_VENDOR" ? "true" : "false"}" aria-label="Single vendor">
                  <span>Single vendor</span>
                  <span class="setup-business-selection-indicator" aria-hidden="true">${selected === "SINGLE_VENDOR" ? "✓" : ""}</span>
                </button>

                <button class="setup-business-option ${selected === "MULTI_VENDOR" ? "is-selected" : ""}"
                  type="button" data-vendor-type="MULTI_VENDOR" role="radio"
                  aria-checked="${selected === "MULTI_VENDOR" ? "true" : "false"}" aria-label="Multi-Vendor">
                  <span>Multi-Vendor</span>
                  <span class="setup-business-selection-indicator" aria-hidden="true">${selected === "MULTI_VENDOR" ? "✓" : ""}</span>
                </button>

                ${onboardingBusinessState.validation.vendorType
                  ? `<p class="field-error" id="vendor-type-error">${escapeHtml(onboardingBusinessState.validation.vendorType)}</p>`
                  : ""}
              </fieldset>

              ${onboardingBusinessState.error
                ? `<p class="form-error" id="setup-business-error" role="alert">${escapeHtml(onboardingBusinessState.error)}</p>`
                : ""}

              <button class="setup-business-submit" id="setup-business-submit" type="submit"
                ${onboardingBusinessState.loading ? "disabled" : ""}>
                ${onboardingBusinessState.loading
                  ? `<span class="login-spinner" aria-hidden="true"></span><span>Setting up...</span>`
                  : "Continue"}
              </button>
            </form>
          </main>
        </div>
      </div>
    </div>
  `;
}

function paymentProviderByValue(category, value) {
  return (PAYMENT_PROVIDERS[category] || []).find((provider) => provider.value === value) || null;
}

function paymentProviderMatches(provider, query) {
  if (!query) return true;
  const normalized = query.toLowerCase().replace(/\s+/g, " ").trim();
  const haystack = [
    provider.label,
    provider.value,
    provider.providerType,
    ...(provider.aliases || [])
  ].join(" ").toLowerCase().replace(/\s+/g, " ");
  return haystack.includes(normalized);
}

function getFilteredPaymentProviders(category) {
  const query = category === "MOBILE_MONEY"
    ? paymentSetupState.mobileProviderSearch
    : paymentSetupState.emailProviderSearch;

  return (PAYMENT_PROVIDERS[category] || []).filter((provider) =>
    provider.enabled !== false && paymentProviderMatches(provider, query)
  );
}

function paymentProviderInitials(provider) {
  if (!provider) return "";
  if (provider.initials) return String(provider.initials).trim().toUpperCase();

  const words = String(provider.label || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) return "?";
  if (words.length === 1) {
    const compact = words[0].replace(/[^A-Za-z0-9]/g, "");
    return compact.slice(0, 2).toUpperCase() || "?";
  }

  return words
    .slice(0, 2)
    .map((word) => word.replace(/[^A-Za-z0-9]/g, "").slice(0, 1))
    .join("")
    .toUpperCase() || "?";
}

function paymentProviderLogoPath(provider) {
  if (!provider) return "";
  if (provider.logo) return String(provider.logo);

  const slug = String(provider.value || provider.label || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug ? "/assets/providers/" + slug + ".svg" : "";
}

function paymentProviderLogo(provider, variant = "dropdown") {
  if (!provider) return "";

  const initials = paymentProviderInitials(provider);
  const logoPath = paymentProviderLogoPath(provider);
  const safeVariant = variant === "main" || variant === "selected" || variant === "linked" ? variant : "dropdown";

  return '<span class="payment-provider-logo payment-provider-logo--' + safeVariant + '" aria-hidden="true">' +
    '<span class="payment-provider-logo-fallback">' + escapeHtml(initials) + '</span>' +
    (logoPath
      ? '<img class="payment-provider-logo-image" src="' + escapeHtml(logoPath) + '" alt="" draggable="false">'
      : "") +
    '</span>';
}

function PaymentCategoryIcon(type) {
  const src = type === "email"
    ? "/assets/payment/email-payment-card.svg"
    : "/assets/payment/mobile-money.svg";
  return '<span class="payment-category-icon" aria-hidden="true"><img src="' + src + '" alt="" draggable="false"></span>';
}

function PaymentChevron(open) {
  return '<svg class="payment-chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="' + (open ? "m6 14 6-6 6 6" : "m6 10 6 6 6-6") + '" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}

function PaymentCategoryHeader(type, title, description, expanded) {
  const categoryKey = type === "mobile" ? "mobile" : "email";
  return '<button class="payment-category-header" type="button" data-payment-category-toggle="' + categoryKey + '" aria-expanded="' + (expanded ? "true" : "false") + '">' +
    PaymentCategoryIcon(type) +
    '<span class="payment-category-copy"><span class="payment-category-title">' + title + '</span><span class="payment-category-description">' + description + '</span></span>' +
    '<span class="payment-category-chevron">' + PaymentChevron(expanded) + '</span></button>';
}

function ProviderOption(provider, selected, category) {
  return '<button class="payment-provider-option ' + (selected ? "is-selected" : "") + '" type="button" data-provider-category="' + category + '" data-provider-value="' + provider.value + '" aria-pressed="' + (selected ? "true" : "false") + '">' +
    '<span class="payment-provider-option-main">' + paymentProviderLogo(provider, "dropdown") + '<span class="payment-provider-name">' + provider.label + '</span></span>' +
    '<span class="payment-selection-control" aria-hidden="true">' + (selected ? "✓" : "") + '</span></button>';
}

function ProviderSelector(category, selectedValue, open) {
  const providers = getFilteredPaymentProviders(category);
  const selected = paymentProviderByValue(category, selectedValue);
  const search = category === "MOBILE_MONEY"
    ? paymentSetupState.mobileProviderSearch
    : paymentSetupState.emailProviderSearch;

  const grouped = providers.reduce((groups, provider) => {
    const group = provider.group || "Payment Providers";
    if (!groups[group]) groups[group] = [];
    groups[group].push(provider);
    return groups;
  }, {});

  return '<div class="payment-provider-selector">' +
    '<button class="payment-provider-trigger" type="button" data-provider-selector="' + category + '" aria-expanded="' + (open ? "true" : "false") + '">' +
    (selected
      ? paymentProviderLogo(selected, "selected")
      : '<span class="payment-provider-trigger-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><rect x="6" y="4" width="12" height="16" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M9 9h6M9 13h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></span>') +
    '<span class="payment-provider-trigger-label">' + (selected ? escapeHtml(selected.label) : "Select Option") + '</span>' +
    '<span class="payment-provider-trigger-chevron">' + PaymentChevron(open) + '</span></button>' +
    (open ? '<div class="payment-provider-list" role="listbox">' +
      '<div class="payment-provider-search-wrap"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="1.8"/><path d="M16 16l4.2 4.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg><input class="payment-provider-search" data-payment-search="' + category + '" type="search" placeholder="' + (category === "MOBILE_MONEY" ? "Search bank or payment provider" : "Search payment provider") + '" value="' + escapeHtml(search) + '" autocomplete="off" aria-label="Search payment providers"></div>' +
      '<div class="payment-provider-results">' +
      (Object.keys(grouped).length
        ? Object.entries(grouped).map(([group, groupProviders]) =>
          '<section class="payment-provider-group"><h3>' + escapeHtml(group) + '</h3>' +
          groupProviders.map((provider) => ProviderOption(provider, provider.value === selectedValue, category)).join("") +
          '</section>'
        ).join("")
        : '<div class="payment-provider-empty"><strong>No payment provider found</strong><span>Try searching with another name.</span></div>') +
      '</div></div>' : "") +
    '</div>';
}

function PaymentField(id, value, provider, mode) {
  const inputType = provider?.identifierType === "EMAIL" ? "email" : provider?.identifierType === "PHONE_NUMBER" ? "tel" : "text";
  const inputMode = provider?.identifierType === "PHONE_NUMBER" ? "tel" : "text";
  return '<div class="payment-field-block"><label class="field-label payment-field-label" for="' + id + '">' +
    escapeHtml(provider?.identifierLabel || "Account Identifier") + '</label>' +
    '<input class="text-input payment-input" id="' + id + '" type="' + inputType + '" inputmode="' + inputMode + '" autocomplete="off" placeholder="' + escapeHtml(provider?.identifierPlaceholder || "Enter account identifier") + '" value="' + escapeHtml(value) + '" data-payment-input="' + mode + '"></div>';
}

function PaymentConfiguration(category) {
  const isMobile = category === "MOBILE_MONEY";
  const provider = paymentProviderByValue(category, isMobile ? paymentSetupState.mobileMoneyProvider : paymentSetupState.emailPaymentProvider);
  const providerOpen = isMobile ? paymentSetupState.mobileProviderOpen : paymentSetupState.emailProviderOpen;
  const accountValue = isMobile ? paymentSetupState.mobileMoneyAccountNumber : paymentSetupState.emailPaymentAccountIdentifier;
  const accountHolder = isMobile ? paymentSetupState.mobileMoneyAccountHolder : paymentSetupState.emailPaymentAccountHolder;
  const validation = isMobile ? paymentSetupState.validation.mobile : paymentSetupState.validation.email;
  const mode = isMobile ? "mobile" : "email";

  return '<div class="payment-configuration">' + ProviderSelector(category, provider?.value || "", providerOpen) +
    (provider ? '<div class="payment-fields">' +
      PaymentField(isMobile ? "mobile-money-account" : "email-payment-account", accountValue, provider, mode) +
      (provider.requiresAccountHolderName ? '<div class="payment-field-block"><label class="field-label payment-field-label" for="' + (isMobile ? "mobile-money-holder" : "email-payment-holder") + '">Account Holder Name</label><input class="text-input payment-input payment-account-holder" id="' + (isMobile ? "mobile-money-holder" : "email-payment-holder") + '" type="text" autocomplete="name" placeholder="Enter account holder name" value="' + escapeHtml(accountHolder) + '" data-payment-holder="' + mode + '"></div>' : "") +
      (validation ? '<p class="field-error payment-field-error" role="alert">' + escapeHtml(validation) + '</p>' : "") +
      '<button class="payment-save-button" type="button" data-save-payment="' + mode + '" ' + (paymentSetupState.savingCategory === mode ? "disabled" : "") + '>' +
      (paymentSetupState.savingCategory === mode ? '<span class="login-spinner" aria-hidden="true"></span><span>Saving...</span>' : "Save Changes") +
      '</button></div>' : "") + '</div>';
}

function SavedPaymentMethodCard(method) {
  const provider = paymentProviderByValue(method.category, method.provider);
  return '<div class="saved-payment-card"><div class="saved-payment-main">' +
    paymentProviderLogo(provider) +
    '<div class="saved-payment-details"><div class="saved-payment-provider">' + escapeHtml(provider?.label || method.provider) + '</div><div class="saved-payment-topline"><span class="saved-payment-account">' + escapeHtml(method.accountIdentifier) + '</span><span class="linked-badge">' + escapeHtml(method.status || "LINKED") + '</span></div><span class="saved-payment-holder">' + escapeHtml(method.accountHolderName || "Account holder") + '</span></div></div>' +
    '<button class="saved-payment-remove" type="button" data-remove-payment="' + escapeHtml(method.id) + '" aria-label="Remove ' + escapeHtml(provider?.label || method.provider) + ' payment method" ' + (paymentSetupState.removingId === method.id ? "disabled" : "") + '>×</button></div>';
}

function SavedPaymentMethodCard(method) {
  const provider = paymentProviderByValue(method.category, method.provider);
  return '<div class="saved-payment-card"><div class="saved-payment-main">' +
    paymentProviderLogo(provider, "linked") +
    '<div class="saved-payment-details"><div class="saved-payment-topline"><span class="saved-payment-account">' + escapeHtml(method.accountIdentifier) + '</span><span class="linked-badge">Linked</span></div><span class="saved-payment-holder">' + escapeHtml(method.accountHolderName || "Account holder") + '</span></div></div>' +
    '<button class="saved-payment-remove" type="button" data-remove-payment="' + escapeHtml(method.id) + '" aria-label="Remove payment method" ' + (paymentSetupState.removingId === method.id ? "disabled" : "") + '><svg class="saved-payment-remove-icon" width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M5 5L13 13M13 5L5 13" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg></button></div>';
}

function getPaymentCategoryState(category) {
  const saved = paymentSetupState.savedMethods.filter(
    (method) => method.category === category
  );

  const isMobile = category === "MOBILE_MONEY";
  const expanded = isMobile
    ? paymentSetupState.mobileMoneyExpanded
    : paymentSetupState.emailPaymentExpanded;
  const saving = paymentSetupState.savingCategory === (isMobile ? "mobile" : "email");
  const validation = isMobile
    ? paymentSetupState.validation.mobile
    : paymentSetupState.validation.email;

  if (saving) return "SAVING";
  if (saved.length) return "LINKED";
  if (validation) return "ERROR";
  if (expanded) {
    const provider = paymentProviderByValue(
      category,
      isMobile
        ? paymentSetupState.mobileMoneyProvider
        : paymentSetupState.emailPaymentProvider
    );
    return provider ? "CONFIGURING" : "EXPANDED";
  }

  return "EMPTY";
}

function PaymentCategory(type) {
  const isMobile = type === "mobile";
  const category = isMobile ? "MOBILE_MONEY" : "EMAIL_PAYMENT";
  const state = getPaymentCategoryState(category);
  const expanded = isMobile
    ? paymentSetupState.mobileMoneyExpanded
    : paymentSetupState.emailPaymentExpanded;
  const saved = paymentSetupState.savedMethods.filter(
    (method) => method.category === category
  );
  const title = isMobile ? "Mobile Money" : "Email Payment";
  const description = isMobile
    ? "Accept payments through popular mobile money platforms"
    : "Accept payments through popular email payment platforms";

  if (state === "LINKED") {
    return '<section class="payment-category-section payment-linked-state">' +
      '<div class="saved-payment-list">' +
      saved.map(SavedPaymentMethodCard).join("") +
      '</div>' +
      '<button class="add-payment-method-button" type="button" data-add-payment="' +
      category +
      '">+ Add another payment method</button>' +
      (expanded ? PaymentConfiguration(category) : "") +
      '</section>';
  }

  return '<section class="payment-category-section"><div class="payment-category-card">' +
    PaymentCategoryHeader(type, title, description, expanded) +
    (expanded ? PaymentConfiguration(category) : "") +
    '</div></section>';
}

function KycDecisionModal() {
  if (!paymentSetupState.kycOpen) return "";
  return '<div class="kyc-modal-root" role="dialog" aria-modal="true" aria-labelledby="kyc-title">' +
    '<div class="kyc-backdrop" aria-hidden="true"></div>' +
    '<button class="kyc-close" type="button" id="kyc-close" aria-label="Close KYC prompt"><svg class="kyc-close-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 7L17 17M17 7L7 17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>' +
    '<section class="kyc-panel">' +
    '<div class="kyc-content"><h2 id="kyc-title">Would you like to complete<br>KYC now</h2>' +
    '<button class="kyc-icon-action" id="kyc-icon-action" type="button" aria-label="Complete KYC">' +
    '<img class="kyc-action-icon" src="/assets/kyc/kyc-action-icon.png" alt="" />' +
    '</button>' +
    '<div class="kyc-divider"><span></span><span></span></div>' +
    '<div class="kyc-or">or</div>' +
    '<button class="kyc-continue" id="kyc-continue" type="button" aria-label="Continue to dashboard">Continue</button>' +
    (paymentSetupState.error ? '<p class="form-error kyc-error" role="alert">' + escapeHtml(paymentSetupState.error) + '</p>' : "") +
    '</div></section></div>';
}

function SetupPaymentMethodScreen() {
  return '<div class="mobile-app-shell"><div class="setup-payment-page"><div class="setup-payment-scroll"><main class="setup-payment-content">' +
    '<button class="back-button" id="setup-payment-back" type="button" aria-label="Back"><svg viewBox="0 0 24 24" fill="none"><path d="M14.5 5.5 8 12l6.5 6.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
    '<header class="setup-payment-header"><h1 class="login-title">Setup payment method</h1><p class="login-subtitle">Choose your preferred payment method</p></header>' +
    '<div class="payment-method-sections">' + PaymentCategory("mobile") + PaymentCategory("email") + '</div>' +
    (paymentSetupState.error && !paymentSetupState.kycOpen ? '<p class="form-error payment-form-error" role="alert">' + escapeHtml(paymentSetupState.error) + '</p>' : "") +
    '<button class="payment-complete-button" id="payment-complete" type="button" ' + (paymentSetupState.loading ? "disabled" : "") + '>' +
    (paymentSetupState.loading ? '<span class="login-spinner" aria-hidden="true"></span><span>Checking...</span>' : "Complete") + '</button>' +
    '</main></div></div>' + KycDecisionModal() + '</div>';
}

function loadPaymentSetupState() {
  try {
    const raw = sessionStorage.getItem("outsider_payment_setup");
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== "object") return;
    if (Array.isArray(saved.savedMethods)) paymentSetupState.savedMethods = saved.savedMethods;
    paymentSetupState.mobileMoneyProvider = String(saved.mobileMoneyProvider || "");
    paymentSetupState.mobileMoneyAccountNumber = String(saved.mobileMoneyAccountNumber || "");
    paymentSetupState.mobileMoneyAccountHolder = String(saved.mobileMoneyAccountHolder || "");
    paymentSetupState.emailPaymentProvider = String(saved.emailPaymentProvider || "");
    paymentSetupState.emailPaymentAccountIdentifier = String(saved.emailPaymentAccountIdentifier || "");
    paymentSetupState.emailPaymentAccountHolder = String(saved.emailPaymentAccountHolder || "");
  } catch {}
}

function persistPaymentSetupState() {
  try {
    sessionStorage.setItem("outsider_payment_setup", JSON.stringify({
      savedMethods: paymentSetupState.savedMethods,
      mobileMoneyProvider: paymentSetupState.mobileMoneyProvider,
      mobileMoneyAccountNumber: paymentSetupState.mobileMoneyAccountNumber,
      mobileMoneyAccountHolder: paymentSetupState.mobileMoneyAccountHolder,
      emailPaymentProvider: paymentSetupState.emailPaymentProvider,
      emailPaymentAccountIdentifier: paymentSetupState.emailPaymentAccountIdentifier,
      emailPaymentAccountHolder: paymentSetupState.emailPaymentAccountHolder
    }));
  } catch {}
}

function togglePaymentCategory(category) {
  if (category === "mobile") {
    paymentSetupState.mobileMoneyExpanded = !paymentSetupState.mobileMoneyExpanded;
    paymentSetupState.mobileProviderOpen = false;
  } else {
    paymentSetupState.emailPaymentExpanded = !paymentSetupState.emailPaymentExpanded;
    paymentSetupState.emailProviderOpen = false;
  }
  paymentSetupState.error = "";
  renderSetupPaymentMethod();
}

function selectPaymentProvider(category, value) {
  const nextProvider = paymentProviderByValue(category, value);
  if (!nextProvider) return;

  if (category === "MOBILE_MONEY") {
    const previousProvider = paymentProviderByValue(category, paymentSetupState.mobileMoneyProvider);
    paymentSetupState.mobileMoneyProvider = value;
    paymentSetupState.mobileProviderOpen = false;
    paymentSetupState.mobileProviderSearch = "";
    paymentSetupState.validation.mobile = "";
    if (previousProvider?.identifierType !== nextProvider.identifierType) {
      paymentSetupState.mobileMoneyAccountNumber = "";
    }
    if (!nextProvider.requiresAccountHolderName) {
      paymentSetupState.mobileMoneyAccountHolder = "";
    }
  } else {
    const previousProvider = paymentProviderByValue(category, paymentSetupState.emailPaymentProvider);
    paymentSetupState.emailPaymentProvider = value;
    paymentSetupState.emailProviderOpen = false;
    paymentSetupState.emailProviderSearch = "";
    paymentSetupState.validation.email = "";
    if (previousProvider?.identifierType !== nextProvider.identifierType) {
      paymentSetupState.emailPaymentAccountIdentifier = "";
    }
    if (!nextProvider.requiresAccountHolderName) {
      paymentSetupState.emailPaymentAccountHolder = "";
    }
  }

  paymentSetupState.error = "";
  renderSetupPaymentMethod();
}

function validatePaymentCategory(category) {
  const isMobile = category === "MOBILE_MONEY";
  const provider = paymentProviderByValue(category, isMobile ? paymentSetupState.mobileMoneyProvider : paymentSetupState.emailPaymentProvider);
  const account = isMobile ? paymentSetupState.mobileMoneyAccountNumber.trim() : paymentSetupState.emailPaymentAccountIdentifier.trim();
  const holder = isMobile ? paymentSetupState.mobileMoneyAccountHolder.trim() : paymentSetupState.emailPaymentAccountHolder.trim();

  if (!provider) return "Please select a payment provider.";
  if (!account) return provider.identifierLabel === "Email Address" ? "Please enter your email address." : "Please enter your " + provider.identifierLabel.toLowerCase() + ".";
  if (provider.identifierType === "EMAIL" && !isValidEmail(account)) return "Please enter a valid email address.";
  if (provider.requiresAccountHolderName && !holder) return "Please enter the account holder name.";
  if (provider.identifierType === "ACCOUNT_NUMBER" && !/^\d{8,20}$/.test(account.replace(/\s+/g, ""))) return "Please enter a valid account number.";
  if (provider.identifierType === "PHONE_NUMBER" && !/^\d{7,15}$/.test(account.replace(/[^\d]/g, ""))) return "Please enter a valid phone number.";
  return "";
}

async function savePaymentMethod(category) {
  if (paymentSetupState.savingCategory) return;
  const isMobile = category === "MOBILE_MONEY";
  const validationKey = isMobile ? "mobile" : "email";
  const error = validatePaymentCategory(category);
  paymentSetupState.validation[validationKey] = error;
  if (error) {
    renderSetupPaymentMethod();
    return;
  }

  const account = isMobile ? paymentSetupState.mobileMoneyAccountNumber.trim() : paymentSetupState.emailPaymentAccountIdentifier.trim();
  const holder = isMobile ? paymentSetupState.mobileMoneyAccountHolder.trim() : paymentSetupState.emailPaymentAccountHolder.trim();
  const provider = isMobile ? paymentSetupState.mobileMoneyProvider : paymentSetupState.emailPaymentProvider;
  paymentSetupState.savingCategory = isMobile ? "mobile" : "email";
  paymentSetupState.error = "";
  renderSetupPaymentMethod();

  try {
    await new Promise((resolve) => window.setTimeout(resolve, 350));
    const existingIndex = paymentSetupState.savedMethods.findIndex((method) =>
      method.category === category && method.provider === provider && method.accountIdentifier === account
    );
    if (existingIndex >= 0) {
      paymentSetupState.validation[validationKey] = "This payment method is already linked.";
      paymentSetupState.savingCategory = "";
      renderSetupPaymentMethod();
      return;
    }

    const method = {
      id: "ui-" + category.toLowerCase() + "-" + Date.now(),
      category,
      provider,
      accountIdentifier: account,
      accountHolderName: holder,
      status: "LINKED",
      verified: false
    };
    if (existingIndex >= 0) paymentSetupState.savedMethods[existingIndex] = method;
    else paymentSetupState.savedMethods.push(method);
    if (isMobile) {
      paymentSetupState.mobileMoneyExpanded = false;
      paymentSetupState.mobileProviderOpen = false;
    } else {
      paymentSetupState.emailPaymentExpanded = false;
      paymentSetupState.emailProviderOpen = false;
    }
    paymentSetupState.validation[validationKey] = "";
    persistPaymentSetupState();
  } catch {
    paymentSetupState.error = "Unable to save this payment method. Please try again.";
  } finally {
    paymentSetupState.savingCategory = "";
    renderSetupPaymentMethod();
  }
}

async function removePaymentMethod(id) {
  if (paymentSetupState.removingId) return;
  const method = paymentSetupState.savedMethods.find((item) => item.id === id);
  const provider = method ? paymentProviderByValue(method.category, method.provider) : null;
  const confirmed = window.confirm(
    "Remove payment method?\n\nAre you sure you want to remove " +
    (provider?.label || "this payment method") + "?"
  );
  if (!confirmed) return;

  paymentSetupState.removingId = id;
  paymentSetupState.error = "";
  renderSetupPaymentMethod();
  try {
    await new Promise((resolve) => window.setTimeout(resolve, 250));
    paymentSetupState.savedMethods = paymentSetupState.savedMethods.filter((method) => method.id !== id);

    if (method?.category === "MOBILE_MONEY") {
      paymentSetupState.mobileMoneyExpanded = false;
      paymentSetupState.mobileProviderOpen = false;
      paymentSetupState.mobileProviderSearch = "";
      paymentSetupState.mobileMoneyProvider = "";
      paymentSetupState.mobileMoneyAccountNumber = "";
      paymentSetupState.mobileMoneyAccountHolder = "";
      paymentSetupState.validation.mobile = "";
    } else if (method?.category === "EMAIL_PAYMENT") {
      paymentSetupState.emailPaymentExpanded = false;
      paymentSetupState.emailProviderOpen = false;
      paymentSetupState.emailProviderSearch = "";
      paymentSetupState.emailPaymentProvider = "";
      paymentSetupState.emailPaymentAccountIdentifier = "";
      paymentSetupState.emailPaymentAccountHolder = "";
      paymentSetupState.validation.email = "";
    }

    paymentSetupState.savingCategory = "";
    paymentSetupState.error = "";
    paymentSetupState.kycOpen = false;
    paymentSetupState.kycLoading = false;
    paymentSetupState.removingId = "";
    persistPaymentSetupState();
  } catch {
    paymentSetupState.error = "Unable to remove this payment method. Please try again.";
  } finally {
    paymentSetupState.removingId = "";
    renderSetupPaymentMethod();
  }
}

function openKycDecision() {
  if (!paymentSetupState.savedMethods.length) {
    paymentSetupState.error = "Link at least one payment method to continue.";
    renderSetupPaymentMethod();
    return;
  }
  paymentSetupState.error = "";
  paymentSetupState.kycOpen = true;
  renderSetupPaymentMethod();
}

function closeKycDecision() {
  const modal = document.querySelector(".kyc-modal-root");
  if (modal) {
    modal.classList.add("is-closing");
    window.setTimeout(() => {
      paymentSetupState.kycOpen = false;
      paymentSetupState.kycLoading = false;
      paymentSetupState.error = "";
      renderSetupPaymentMethod();
      window.setTimeout(() => document.getElementById("payment-complete")?.focus(), 0);
    }, 220);
    return;
  }
  paymentSetupState.kycOpen = false;
  paymentSetupState.kycLoading = false;
  paymentSetupState.error = "";
  renderSetupPaymentMethod();
}

function navigateFromKycPrompt(path) {
  const modal = document.querySelector(".kyc-modal-root");
  if (modal) {
    modal.classList.add("is-closing");
    window.setTimeout(() => {
      paymentSetupState.kycOpen = false;
      paymentSetupState.kycLoading = false;
      paymentSetupState.error = "";
      window.location.href = path;
    }, 220);
    return;
  }
  paymentSetupState.kycOpen = false;
  paymentSetupState.kycLoading = false;
  paymentSetupState.error = "";
  window.location.href = path;
}

function openKycFlow() {
  navigateFromKycPrompt("/onboarding/kyc");
}

function continueToDashboard() {
  navigateFromKycPrompt("/home");
}

function bindSetupPaymentMethodEvents() {
  document.querySelectorAll("[data-payment-category-toggle]").forEach((button) => {
    button.addEventListener("click", () => togglePaymentCategory(button.dataset.paymentCategoryToggle));
  });
  document.querySelectorAll("[data-provider-selector]").forEach((button) => {
    button.addEventListener("click", () => {
      const category = button.dataset.providerSelector;
      if (category === "MOBILE_MONEY") {
        paymentSetupState.mobileProviderOpen = !paymentSetupState.mobileProviderOpen;
        paymentSetupState.emailProviderOpen = false;
        paymentSetupState.mobileProviderSearch = "";
      } else {
        paymentSetupState.emailProviderOpen = !paymentSetupState.emailProviderOpen;
        paymentSetupState.mobileProviderOpen = false;
        paymentSetupState.emailProviderSearch = "";
      }
      paymentSetupState.error = "";
      renderSetupPaymentMethod();
      window.setTimeout(() => {
        document.querySelector('[data-payment-search="' + category + '"]')?.focus();
      }, 0);
    });
  });

  document.querySelectorAll("[data-payment-search]").forEach((input) => {
    input.addEventListener("input", (event) => {
      const category = event.target.dataset.paymentSearch;
      if (category === "MOBILE_MONEY") {
        paymentSetupState.mobileProviderSearch = event.target.value;
      } else {
        paymentSetupState.emailProviderSearch = event.target.value;
      }
      renderSetupPaymentMethod();
      window.setTimeout(() => {
        const next = document.querySelector('[data-payment-search="' + category + '"]');
        next?.focus();
        if (next) next.setSelectionRange(next.value.length, next.value.length);
      }, 0);
    });
  });
  document.querySelectorAll("[data-provider-category]").forEach((button) => {
    button.addEventListener("click", () => selectPaymentProvider(button.dataset.providerCategory, button.dataset.providerValue));
  });
  document.getElementById("mobile-money-account")?.addEventListener("input", (event) => {
    paymentSetupState.mobileMoneyAccountNumber = event.target.value;
    paymentSetupState.validation.mobile = "";
    paymentSetupState.error = "";
  });
  document.getElementById("mobile-money-holder")?.addEventListener("input", (event) => {
    paymentSetupState.mobileMoneyAccountHolder = event.target.value;
    paymentSetupState.validation.mobile = "";
    paymentSetupState.error = "";
  });
  document.getElementById("email-payment-account")?.addEventListener("input", (event) => {
    paymentSetupState.emailPaymentAccountIdentifier = event.target.value;
    paymentSetupState.validation.email = "";
    paymentSetupState.error = "";
  });
  document.getElementById("email-payment-holder")?.addEventListener("input", (event) => {
    paymentSetupState.emailPaymentAccountHolder = event.target.value;
    paymentSetupState.validation.email = "";
    paymentSetupState.error = "";
  });
  document.querySelectorAll("[data-save-payment]").forEach((button) => {
    button.addEventListener("click", () => savePaymentMethod(button.dataset.savePayment === "mobile" ? "MOBILE_MONEY" : "EMAIL_PAYMENT"));
  });
  document.querySelectorAll("[data-remove-payment]").forEach((button) => {
    button.addEventListener("click", () => removePaymentMethod(button.dataset.removePayment));
  });
  document.querySelectorAll("[data-add-payment]").forEach((button) => {
    button.addEventListener("click", () => {
      const category = button.dataset.addPayment;
      if (category === "MOBILE_MONEY") {
        paymentSetupState.mobileMoneyProvider = "";
        paymentSetupState.mobileMoneyAccountNumber = "";
        paymentSetupState.mobileMoneyAccountHolder = "";
        paymentSetupState.mobileMoneyExpanded = true;
        paymentSetupState.mobileProviderOpen = true;
        paymentSetupState.mobileProviderSearch = "";
        paymentSetupState.emailPaymentExpanded = false;
        paymentSetupState.emailProviderOpen = false;
      } else {
        paymentSetupState.emailPaymentProvider = "";
        paymentSetupState.emailPaymentAccountIdentifier = "";
        paymentSetupState.emailPaymentAccountHolder = "";
        paymentSetupState.emailPaymentExpanded = true;
        paymentSetupState.emailProviderOpen = true;
        paymentSetupState.emailProviderSearch = "";
        paymentSetupState.mobileMoneyExpanded = false;
        paymentSetupState.mobileProviderOpen = false;
      }
      paymentSetupState.error = "";
      renderSetupPaymentMethod();
      window.setTimeout(() => {
        document.querySelector('[data-payment-search="' + category + '"]')?.focus();
      }, 0);
    });
  });
  document.getElementById("payment-complete")?.addEventListener("click", openKycDecision);
  document.getElementById("setup-payment-back")?.addEventListener("click", () => {
    window.location.href = "/onboarding/business";
  });
  if (paymentSetupState.kycOpen) {
    document.getElementById("kyc-close")?.addEventListener("click", closeKycDecision);
    document.getElementById("kyc-icon-action")?.addEventListener("click", openKycFlow);
    document.getElementById("kyc-continue")?.addEventListener("click", continueToDashboard);
    window.setTimeout(() => document.getElementById("kyc-close")?.focus(), 0);
  }
}

function renderSetupPaymentMethod() {
  app.innerHTML = SetupPaymentMethodScreen();
  bindSetupPaymentMethodEvents();
}

const HOME_STORAGE_KEY = "outsider_home_availability_v2";
const HOME_FALLBACK_LOCATION = {
  latitude: 9.0765,
  longitude: 7.3986
};

const HOME_AVATAR_DATA_URI = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACUAAAAnCAYAAACIVoEIAAAJf0lEQVR42u2YSWwkZxXHf7VXl9td3e722u1lPD0TO56MJ8ssmUAWkZAECEgIITggceLAAcEFJC5EiO0AQgIkJITYDkE5IQgoChBCIiYQkkBmyXgZj6en3fa03Xt3dXdtXcUhwhljjzMJHHLgO9ShpPf0q3+9721CGIYh77Ij8i4870oo+Z0Y+b5PsVjEsiwsy8K2bXzff+MrRRFVVZFlmWg0imEYKIrytvwLbyem6vU6uVwOq9kkGe3HNAyiqoamqsjiG6L7QYDjuliuQ6PToWK1iA8MkMlkiMfj/zso27ZZXFzEbrdJxxMMmfFtiND1cDfLhLaDEOtDHUwiiDujYrPZIF8pEzVNstksuq7/d1CFQoFCfo20aTKWGNh+776+hPP9n8JfXkVrdZFCEV+U6Mb64MTtCB+4F+PBUyix/m2bjVqN9UaNzMQEmUzmnUHlcjmK6+sczUygXRcX7rVNeg9/Cr1WAUKkUEBAJgRsJCxBxBZEuukRzC9/htRjD76puudxvpBnJJ1mamrq7d2+XC5H6VpxFxBA8MSv0GslxNBBDGzAA1xCHAJc5NBFDh38wlU2P/9V1n/zzLatrijclpmgdK1ILpe7eahCoUBxfZ25sfQuIG/jGuIvnkAKOhB2AAfwCHBx8XDo4uIghgE6AqorUv7173f40BWFW8fSFNfXKRQKb50SbNumkF/bUyGA/Le/gyf5iJkE0T4ZTdRxG116VQvFdwjCkCAMgB4CKhoqfsff5effip3P50mlUjuCfxfUysoKadPcE8izLZw7TbQ7H0DqU9HMIYyxLBFBJdzaoHT2HPXCJsWLV7FWK6RaPSbCEKHW2vM36YpC2kywuLjIsWPH9oaq1+tYjQazBw7u6aRrNbB7DrGYgWYoCLKAL4aIEpBKEJ+bRB2NwPQAi+sVzqxscqHpM+TVONzrIUrSLp9jiQTrVy5Tr9e385j8n7E0kUztk8ldFAlUWUKVVBQtihQxCT2XsN1E9tpocoAqwUjSZHwkiSdp1MK+ffPSWDxBLpfbVku+Ppbq1Sqz2cM3NA4ArxeyunoFMWIiGh0idZvxWB9Sp4osiTR8BUUGUxfQFJUGMhE9sadK/z7Dpkl+9TK+7yPL8ptQ9XqdZLR/3y9qbG1QbNp4jsDY8BDdbpsLzz5NdyxFwtBYLtVZ2rKJRWQ6XYfxwQR9iQGSU+n9C7AokYz2UywWyWQyb0KVy2UGDGNf4163g9zzyFcsFor/pFltMD48QDA4Tsm2KHo9Zman6VptrPUNym6ApEY4csv8W9Y70zBoWtbu3xcd2F+pxGiaTryfkYE4za6LqGfJDCUIAKnpshbREQKfpVyegtXhrqGDBKHAE9/7Gl/4xo8QBOGGvqOazkaltBtKU/dpMcKQer2CpssMDI0zJCv4HYvEgImWyNBZfZW5EQczbjKoTNCRVXRDp+Hr3Hbyvn2BADRFxrbtnVC+729X/r2AADpWm57tsrZ8nmrT4ejcLC88/wr92otsFio0/JD5o30cnJ3FbpTIt6HtwYce++RbN3aitN2T3VyTJ7zxCEJodros5Law3RAvXCaMJrmwsUlPiGB3a9RqZa6+3kJQRVpBlJ4a3/fm7Vv7ZFnGD4L9qAjlCL4skU7FUQSFcqnLUHKAU6fvZnxkhK4n8ss/n+O51QpXazblSp1WpW3tz3WzQQ5blnUrpuo7jesi6dkPDyYMz/PIn3+W+7DC3TQ4zHDcZvWWeMAgY7LmEVhejf4DBuAGKztrGJqeOP3xTUI7nb9e/bahoNIrl2vTtA5VMDeEbw/z8zBLzmUE+dnyWn/z4h/hIGIKHbui0ewHFssPLSwUKbYdPHzl2U1CWY29DiddDNbqd/SW2qjwwN0nLhzMr13i93Oae4/NMj48wkR6l7Ms8t1Dgt69d4aUrGxzOTGHGzJuCanQ6pFKpnZ2n7/v87cUXOT6d3XELS/klNs6/gH92gbHnf4+jxPimHuVcqUa/ppCMRhCCAFFSWS418PwenudgiAKnmm3mpwa4+8MfIX3vB4kdnkO4wWTz15Vl7jpxAl3Xd7bDr732Gv09H6nTonL5ZRYu/J1Lf/8rHzke56k/N/jU+95PTW9xaavNU/9YZblYRVQ1bKdHRFPoOC6e69KnyRwd0+hvdpivShysthgRfSoPZjHfM4dh3IJ+6DRD83dsDxZV3+PIkSO7U8LU1BRn//QsY09+hebFKhcHFE7PJvjd5X7s6WEqczPI7gYPHE8QF+H5ywZ/XChgdboEjowiCQzGZA6MjXLnsIwhwKql87f8JhOTadJGi0eVNptP/xb7lWeQS3dh3vM58pUqM3Nz2xzS448//vj1N7DuuFhyk6BZZrnpcTnfIpBEJicP8NSzL+BdWiDttNi6VGMz6HH6aIa2HXIoKfKebJJHTk4wLApMhtCVdAJJ55ajs6QGTeTQQQ81LrQdWnEYiNVZr1noE3cwMTFx485zZmaGlyuPEi6f5dGGw5rt87NLJS5vneF0NMJDG206a0uop8eZqoScv7jG5XyJQ9lBHn7vSUxDpz0tkNZClPgk1XqVxfwmhXKDe1a2CM9UiJ7I0ux65OpRtPn7uCObfesRq1AocOmfL3Ho3JMoX/8N56aHmS1bJKoNlF7Ak2Mx7AeO8dwrq8xmUnRFl4/ff4LR1Bj9poYkS8hGFEHrp1NvUbi0QCxhEtcHKX/pWzwxEef+Tz6GNfN+Zm49smsG3LPMZDIZfN9nrdtlJnmGexfWEBCQwpCOJnMl2Yd9cZHbUypS1eYTD92Kqsl0WxXMWIL8wgqFShc/kPB7IWZEYvzICbo/+DGq7xGkUnjZk2QPz+w5lO6IqetPPB6n1xcjd+sR1Kvn8D86RvdAiiDX4gVE7n5klAOqz/T9j6DLIYnJgyhhm8C3EVUdWe+n1nY5my9RbXVol9YJozp6J0T57BeZPnbyhsPoTY3taysXiWw9R2TpGarLIk8vtBjNKNx7/A7S2UNYrRqNrU1WchucOn0KwzBAk3GaTVavbLJR2gRRwpg5Sd/s3UxmD7/zsf36XmtlZYXiykXE9Vdxrixxz+1zyKlR6tUOL/3pD6xtlfngQycRHIgmEsSGkoR+QLXeYkOI0R6aIT46zszMzH+/4PjPEaxQKFAvFUk4ZQyvgVtco1O5xvD4OH2qQrlY5MJaldhIGiOTxUkeIJYcZGpq6n+7CtpLuXq9TrlcxrbtXUszRVHQdR1VVYnH44ji21sYCv9fxN7k+Re4smODFOqLugAAAABJRU5ErkJggg==";

const homeState = {
  availabilityStatus: "ONLINE",
  dragProgress: 0,
  dragStartX: 0,
  dragging: false,
  error: "",
  map: null,
  mapMarker: null,
  mapRoute: null,
  mapPlaces: [],
  geolocationWatchId: null,
  fallbackTimer: null,
  mapReady: false,
  location: null,
  mapResizeObserver: null,
  businessSelectorExpanded: false
};

function getStoredHomeAvailability() {
  try {
    const value = localStorage.getItem(HOME_STORAGE_KEY);
    return value === "OFFLINE" ? "OFFLINE" : "ONLINE";
  } catch {
    return "OFFLINE";
  }
}

function persistHomeAvailability(status) {
  try {
    localStorage.setItem(HOME_STORAGE_KEY, status);
  } catch {}
}

function HomeMap() {
  const online = homeState.availabilityStatus === "ONLINE";

  return `
    <section class="home-map ${online ? "is-online" : "is-offline"}" aria-label="Business map">
      <div class="home-map-canvas" id="home-map-canvas">
        <div class="home-map-loading" id="home-map-loading">Loading map…</div>
      </div>

      <button class="home-support-button" type="button" aria-label="Support">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5 13v-1a7 7 0 0 1 14 0v1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <path d="M5 13H4a2 2 0 0 0-2 2v1a2 2 0 0 0 2 2h1v-5ZM19 13h1a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2h-1v-5Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
          <path d="M19 18c-.6 2-2.5 3-5 3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </button>
    </section>
  `;
}

function HomeHeader() {
  const expanded = homeState.businessSelectorExpanded;
  return `
    <header class="home-header">
      <button
        class="home-business-selector ${expanded ? "is-expanded" : "is-collapsed"}"
        id="home-business-selector"
        type="button"
        aria-label="${expanded ? "Close business balance" : "Open business balance"}"
        aria-expanded="${expanded ? "true" : "false"}"
      >
        <span class="home-avatar-placeholder" aria-label="Profile image placeholder"></span>
        <span class="home-balance">₦0</span>
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="${expanded ? "m14 7-5 5 5 5" : "m10 7 5 5-5 5"}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>

      <div class="home-header-actions">
        <button type="button" class="home-header-icon" aria-label="Messages">
          <img class="home-header-icon-asset" src="https://pub-b87c2da0a35d4c948c75fd7926636fc9.r2.dev/outsider/business/icons/message.svg" alt="" aria-hidden="true" />
          <span class="home-notification-badge">0</span>
        </button>

        <button type="button" class="home-header-icon" aria-label="Notifications">
          <img class="home-header-icon-asset" src="https://pub-b87c2da0a35d4c948c75fd7926636fc9.r2.dev/outsider/business/icons/notification.svg" alt="" aria-hidden="true" />
          <span class="home-notification-badge">0</span>
        </button>
      </div>
    </header>
  `;
}

function HomeSliderChevron({ direction }) {
  const left = direction === "left";
  return `
    <svg class="home-slider-chevron-svg" viewBox="0 0 20 24" fill="none" aria-hidden="true">
      ${left
        ? '<path d="M15 4 8 12l7 8M8 4 1 12l7 8" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>'
        : '<path d="M5 4l7 8-7 8M12 4l7 8-7 8" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>'
      }
    </svg>
  `;
}

function HomeAvailabilitySlider() {
  const online = homeState.availabilityStatus === "ONLINE";
  const busy = homeState.availabilityStatus === "GOING_ONLINE" || homeState.availabilityStatus === "GOING_OFFLINE";
  const progress = Math.round(homeState.dragProgress * 100);
  const goingOffline = homeState.availabilityStatus === "GOING_OFFLINE";
  const visualOnline = online || goingOffline;

  return `
    <div
      class="home-availability ${online ? "is-online" : ""} ${busy ? "is-busy" : ""} ${goingOffline ? "is-going-offline" : ""}"
      id="home-availability"
      data-status="${homeState.availabilityStatus}"
      style="--drag-progress: ${progress}%"
      role="slider"
      aria-valuemin="0"
      aria-valuemax="100"
      aria-valuenow="${progress}"
      aria-label="${visualOnline ? "Slide left to go offline" : "Slide right to go online"}"
      tabindex="0"
    >
      <span class="home-availability-fill" aria-hidden="true"></span>
      <span class="home-slider-chevron home-slider-chevron-left" aria-hidden="true">${HomeSliderChevron({direction: visualOnline ? "left" : "right"})}</span>
      <span class="home-slider-label">${visualOnline ? "You are now online" : "Go online"}</span>
      <span class="home-slider-chevron home-slider-chevron-right" aria-hidden="true">${HomeSliderChevron({direction: visualOnline ? "left" : "right"})}</span>
      <span class="home-availability-gesture" aria-hidden="true"></span>
    </div>
    ${homeState.error ? `<p class="home-availability-error" role="alert">${escapeHtml(homeState.error)}</p>` : ""}
  `;
}

function HomePerformanceCards() {
  const arrow = '<svg class="home-card-arrow-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m6 3 4 5-4 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const trend = '<svg class="home-trend-icon" viewBox="0 0 18 16" fill="none" aria-hidden="true"><path d="M2 12 6 8l3 2 6-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M11.5 3H15v3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  return `
    <section class="home-performance">
      <div class="home-earnings-card">
        <div class="home-card-heading">
          <span>Today's earnings</span>
          ${arrow}
        </div>
        <strong>₦0</strong>
      </div>

      <div class="home-performance-side">
        <div class="home-metric-card">
          <div class="home-card-heading">
            <span>Acceptance rate</span>
            ${trend}
          </div>
          <strong>90%</strong>
        </div>

        <div class="home-metric-card">
          <div class="home-card-heading">
            <span>Completion Rate</span>
            ${trend}
          </div>
          <strong>89%</strong>
        </div>
      </div>
    </section>
  `;
}

function HomeStockAlerts() {
  return `
    <section class="home-stock-section">
      <h2>Stock alert</h2>
      <div class="home-stock-scroll">
        <article class="home-stock-card is-low">
          <div class="home-stock-icon">
            <img src="/assets/stock-alert.png" alt="" />
          </div>
          <div>
            <strong>Running Low</strong>
            <p>You are running low on<br>these stock</p>
          </div>
        </article>

        <article class="home-stock-card is-warning">
          <div class="home-stock-icon">
            <img src="/assets/stock-alert.png" alt="" />
          </div>
          <div>
            <strong>Stock Below 70%</strong>
            <p>Check if you need to<br>these stocks</p>
          </div>
        </article>
      </div>
    </section>
  `;
}

function HomeBottomNavigation() {
  const iconBase = "https://pub-b87c2da0a35d4c948c75fd7926636fc9.r2.dev/outsider/business/icons";
  return `
    <nav class="home-bottom-nav" aria-label="Primary navigation">
      <button class="home-nav-item is-active" type="button" data-home-nav="home">
        <span class="home-nav-icon"><img class="home-nav-icon-asset" src="${iconBase}/Home.svg" alt="" aria-hidden="true" /></span>
        <span>Home</span>
      </button>
      <button class="home-nav-item" type="button" data-home-nav="orders">
        <span class="home-nav-icon"><img class="home-nav-icon-asset" src="${iconBase}/Inventory.svg" alt="" aria-hidden="true" /></span>
        <span>Orders</span>
      </button>
      <button class="home-nav-item" type="button" data-home-nav="stock">
        <span class="home-nav-icon"><img class="home-nav-icon-asset" src="${iconBase}/Order-fixed.svg" alt="" aria-hidden="true" /></span>
        <span>Stock</span>
      </button>
      <button class="home-nav-item" type="button" data-home-nav="wallet">
        <span class="home-nav-icon"><img class="home-nav-icon-asset" src="${iconBase}/Wallet.svg" alt="" aria-hidden="true" /></span>
        <span>Wallet</span>
      </button>
    </nav>
  `;
}

function HomeScreen() {
  return `
    <div class="mobile-app-shell home-shell">
      ${HomeHeader()}
      <main class="home-main">
        ${HomeMap()}
        <div class="home-content-panel">
          ${HomeAvailabilitySlider()}
          ${HomePerformanceCards()}
        </div>
        ${HomeStockAlerts()}
      </main>
      ${HomeBottomNavigation()}
    </div>
  `;
}

function getHomeStoredLocation() {
  try {
    const raw = sessionStorage.getItem("outsider_onboarding_business");
    const parsed = raw ? JSON.parse(raw) : null;
    const latitude = Number(parsed?.locationData?.latitude);
    const longitude = Number(parsed?.locationData?.longitude);

    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      return { latitude, longitude };
    }
  } catch {}

  return null;
}

function offsetHomeLocation(location, northMeters, eastMeters) {
  const latitude = location.latitude + northMeters / 111320;
  const longitude = location.longitude + eastMeters / (111320 * Math.cos(location.latitude * Math.PI / 180));
  return [latitude, longitude];
}

function updateHomeMapOverlays() {
  if (!homeState.map || !homeState.location || typeof L === "undefined") return;

  homeState.mapPlaces.forEach((layer) => layer.remove());
  homeState.mapPlaces = [];

  if (homeState.mapMarker) {
    homeState.mapMarker.remove();
    homeState.mapMarker = null;
  }

  if (homeState.mapRoute) {
    homeState.mapRoute.remove();
    homeState.mapRoute = null;
  }

  if (homeState.availabilityStatus !== "ONLINE") return;

  const location = homeState.location;
  const routeCoordinates = [
    offsetHomeLocation(location, -420, -650),
    offsetHomeLocation(location, -260, -380),
    offsetHomeLocation(location, -110, -120),
    offsetHomeLocation(location, 40, 40),
    offsetHomeLocation(location, 210, 320),
    offsetHomeLocation(location, 430, 520)
  ];

  homeState.mapRoute = L.polyline(routeCoordinates, {
    color: "#22D55A",
    weight: 4,
    opacity: 0.96,
    lineCap: "round",
    lineJoin: "round"
  }).addTo(homeState.map);

  // Figma online-state accent: a short red route segment remains visible
  // alongside the active green route and is clipped by the map frame.
  const redRouteCoordinates = [
    offsetHomeLocation(location, 115, 310),
    offsetHomeLocation(location, 145, 320)
  ];
  homeState.mapPlaces.push(
    L.polyline(redRouteCoordinates, {
      color: "#FF3B30",
      weight: 4,
      opacity: 0.96,
      lineCap: "round",
      lineJoin: "round"
    }).addTo(homeState.map)
  );

  homeState.mapMarker = L.circleMarker([location.latitude, location.longitude], {
    radius: 7,
    color: "#FFFFFF",
    weight: 3,
    fillColor: "#F8831D",
    fillOpacity: 1
  }).addTo(homeState.map);

  [
    offsetHomeLocation(location, 180, -240),
    offsetHomeLocation(location, 320, 260),
    offsetHomeLocation(location, -180, 620)
  ].forEach((coordinates) => {
    const marker = L.circleMarker(coordinates, {
      radius: 7,
      color: "#FFFFFF",
      weight: 3,
      fillColor: "#F8831D",
      fillOpacity: 1
    }).addTo(homeState.map);
    homeState.mapPlaces.push(marker);
  });
}

function followHomeLocation(location, animate = true) {
  if (!homeState.map || !location) return;

  homeState.location = location;
  const center = [location.latitude, location.longitude];

  homeState.map.setView(center, 16, {
    animate,
    duration: 0.8
  });

  updateHomeMapOverlays();
}

function startHomeFallbackLocation() {
  if (homeState.fallbackTimer) {
    clearInterval(homeState.fallbackTimer);
    homeState.fallbackTimer = null;
  }

  if (homeState.availabilityStatus !== "ONLINE") return;

  const path = [
    { latitude: HOME_FALLBACK_LOCATION.latitude, longitude: HOME_FALLBACK_LOCATION.longitude },
    offsetHomeLocation(HOME_FALLBACK_LOCATION, 90, 80),
    offsetHomeLocation(HOME_FALLBACK_LOCATION, 160, 210),
    offsetHomeLocation(HOME_FALLBACK_LOCATION, 70, 330),
    offsetHomeLocation(HOME_FALLBACK_LOCATION, -70, 210)
  ];

  let index = 0;
  followHomeLocation(path[index], false);

  homeState.fallbackTimer = window.setInterval(() => {
    if (homeState.availabilityStatus !== "ONLINE") return;
    index = (index + 1) % path.length;
    followHomeLocation(path[index], true);
  }, 4200);
}

function stopHomeLocationTracking() {
  if (homeState.geolocationWatchId !== null && "geolocation" in navigator) {
    navigator.geolocation.clearWatch(homeState.geolocationWatchId);
    homeState.geolocationWatchId = null;
  }

  if (homeState.fallbackTimer) {
    clearInterval(homeState.fallbackTimer);
    homeState.fallbackTimer = null;
  }
}

function startHomeLocationTracking() {
  stopHomeLocationTracking();

  if (homeState.availabilityStatus !== "ONLINE") return;

  const storedLocation = getHomeStoredLocation();
  if (storedLocation) {
    followHomeLocation(storedLocation, false);
  } else {
    followHomeLocation(HOME_FALLBACK_LOCATION, false);
  }

  if (!("geolocation" in navigator)) {
    startHomeFallbackLocation();
    return;
  }

  homeState.geolocationWatchId = navigator.geolocation.watchPosition(
    (position) => {
      followHomeLocation({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
      }, true);
    },
    () => {
      startHomeFallbackLocation();
    },
    {
      enableHighAccuracy: true,
      maximumAge: 15000,
      timeout: 10000
    }
  );
}

function destroyHomeMap() {
  stopHomeLocationTracking();

  if (homeState.mapResizeObserver) {
    homeState.mapResizeObserver.disconnect();
    homeState.mapResizeObserver = null;
  }

  if (homeState.map) {
    homeState.map.remove();
  }

  homeState.map = null;
  homeState.mapMarker = null;
  homeState.mapRoute = null;
  homeState.mapPlaces = [];
  homeState.mapReady = false;
}

function initHomeMap() {
  const container = document.getElementById("home-map-canvas");
  const loading = document.getElementById("home-map-loading");

  if (!container || typeof L === "undefined") {
    if (loading) loading.textContent = "Map unavailable";
    return;
  }

  homeState.map = L.map(container, {
    zoomControl: false,
    attributionControl: true,
    dragging: true,
    touchZoom: true,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    boxZoom: false,
    keyboard: false,
    tap: true
  });

  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    subdomains: "abcd",
    maxZoom: 20,
    attribution: "&copy; OpenStreetMap &copy; CARTO"
  }).addTo(homeState.map);

  homeState.mapReady = true;
  if (loading) loading.remove();

  const mapElement = document.querySelector(".home-map");
  if (mapElement && window.ResizeObserver) {
    homeState.mapResizeObserver = new ResizeObserver(() => {
      homeState.map?.invalidateSize({ animate: false, pan: false });
    });
    homeState.mapResizeObserver.observe(mapElement);
  }

  const storedLocation = getHomeStoredLocation();
  followHomeLocation(storedLocation || HOME_FALLBACK_LOCATION, false);

  if (homeState.availabilityStatus === "ONLINE") {
    startHomeLocationTracking();
  }
}

function confirmHomeAvailability(targetStatus) {
  homeState.error = "";
  homeState.availabilityStatus = targetStatus;
  homeState.dragProgress = 0;
  persistHomeAvailability(targetStatus);
  renderHome();
}

function resetHomeAvailabilityDrag(control) {
  homeState.dragging = false;
  homeState.dragProgress = 0;
  control.classList.remove("is-dragging");
  control.style.setProperty("--drag-progress", "0%");
  control.setAttribute("aria-valuenow", "0");
}

function completeHomeDrag(clientX) {
  if (!homeState.dragging) return;

  const control = document.getElementById("home-availability");
  const rect = control?.getBoundingClientRect();
  if (!rect) return;

  const delta = clientX - homeState.dragStartX;
  const distance = Math.max(1, rect.width);
  const progress = Math.max(-1, Math.min(1, delta / distance));
  const online = homeState.availabilityStatus === "ONLINE";
  const reached = online ? progress <= -0.45 : progress >= 0.45;

  if (!reached) {
    resetHomeAvailabilityDrag(control);
    return;
  }

  homeState.dragging = false;
  homeState.dragProgress = 0;
  control.classList.remove("is-dragging");
  const target = online ? "OFFLINE" : "ONLINE";
  homeState.availabilityStatus = online ? "GOING_OFFLINE" : "GOING_ONLINE";
  confirmHomeAvailability(target);
}

function bindHomeAvailability() {
  const control = document.getElementById("home-availability");
  const gesture = control?.querySelector(".home-availability-gesture");
  if (!control || !gesture) return;

  gesture.addEventListener("pointerdown", (event) => {
    if (homeState.availabilityStatus !== "ONLINE" && homeState.availabilityStatus !== "OFFLINE") {
      return;
    }

    homeState.dragging = true;
    homeState.dragStartX = event.clientX;
    gesture.setPointerCapture?.(event.pointerId);
    control.classList.add("is-dragging");
  });

  gesture.addEventListener("pointermove", (event) => {
    if (!homeState.dragging) return;

    const delta = event.clientX - homeState.dragStartX;
    const distance = Math.max(1, control.getBoundingClientRect().width);
    const online = homeState.availabilityStatus === "ONLINE";
    const directionalProgress = online ? Math.max(0, -delta / distance) : Math.max(0, delta / distance);

    homeState.dragProgress = Math.min(1, directionalProgress);
    control.style.setProperty("--drag-progress", `${Math.round(homeState.dragProgress * 100)}%`);
    control.setAttribute("aria-valuenow", String(Math.round(homeState.dragProgress * 100)));
  });

  gesture.addEventListener("pointerup", (event) => {
    completeHomeDrag(event.clientX);
  });

  gesture.addEventListener("pointercancel", () => {
    if (!homeState.dragging) return;
    resetHomeAvailabilityDrag(control);
  });

  control.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft" && event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();

    const online = homeState.availabilityStatus === "ONLINE";
    const target = online ? "OFFLINE" : "ONLINE";
    confirmHomeAvailability(target);
  });
}

function bindHomeNavigation() {
  const businessSelector = document.getElementById("home-business-selector");
  businessSelector?.addEventListener("click", () => {
    homeState.businessSelectorExpanded = !homeState.businessSelectorExpanded;
    const expanded = homeState.businessSelectorExpanded;
    businessSelector.classList.toggle("is-expanded", expanded);
    businessSelector.classList.toggle("is-collapsed", !expanded);
    businessSelector.setAttribute("aria-expanded", String(expanded));
    businessSelector.setAttribute(
      "aria-label",
      expanded ? "Close business balance" : "Open business balance"
    );

    const balance = businessSelector.querySelector(".home-balance");
    if (balance) balance.hidden = !expanded;

    const chevron = businessSelector.querySelector("path");
    if (chevron) {
      chevron.setAttribute(
        "d",
        expanded ? "m14 7-5 5 5 5" : "m10 7 5 5-5 5"
      );
    }
  });

  document.querySelectorAll("[data-home-nav]").forEach((button) => {
    button.addEventListener("click", () => {
      const destination = button.dataset.homeNav;
      if (destination === "home") return;
      button.classList.add("is-pressed");
      window.setTimeout(() => button.classList.remove("is-pressed"), 140);
    });
  });
}

function renderHome() {
  destroyHomeMap();
  app.innerHTML = HomeScreen();
  bindHomeAvailability();
  bindHomeNavigation();
  window.requestAnimationFrame(() => initHomeMap());
}

function renderPlaceholder() {
  app.innerHTML = `
    <main class="screen-message">
      <p>This screen will be implemented from its approved specification next.</p>
    </main>
  `;
}

function renderLogin() {
  app.innerHTML = LoginScreen();
  bindLoginEvents();
}

function renderSignup() {
  app.innerHTML = SignupScreen();
  bindSignupEvents();
}

function updateSetupBusinessSubmitState() {
  const button = document.getElementById("setup-business-submit");

  if (!button || onboardingBusinessState.loading) {
    return;
  }

  button.disabled =
    !onboardingBusinessState.businessName.trim() ||
    !onboardingBusinessState.businessLocation.trim() ||
    !onboardingBusinessState.vendorType;
}

function validateSetupBusiness() {
  onboardingBusinessState.validation.businessName = "";
  onboardingBusinessState.validation.businessLocation = "";
  onboardingBusinessState.validation.vendorType = "";
  onboardingBusinessState.error = "";

  if (!onboardingBusinessState.businessName.trim()) {
    onboardingBusinessState.validation.businessName =
      "Business name is required";
  }

  if (!onboardingBusinessState.businessLocation.trim()) {
    onboardingBusinessState.validation.businessLocation =
      "Business location is required";
  }

  if (!onboardingBusinessState.vendorType) {
    onboardingBusinessState.validation.vendorType =
      "Select a vendor option";
  }

  return !Object.values(
    onboardingBusinessState.validation
  ).some(Boolean);
}

async function createBusiness(businessName, vendorType) {
  if (isOutsiderTestMode()) {
    const business = {
      id: "mock-test-business",
      name: businessName,
      business_type: vendorType,
      testAccount: true
    };

    try {
      sessionStorage.setItem(OUTSIDER_TEST_BUSINESS_KEY, JSON.stringify(business));
    } catch {}

    return { business };
  }

  let response;

  try {
    response = await fetch(
      API + "/api/businesses",
      {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({
          name: businessName,
          business_type: vendorType
        })
      }
    );
  } catch {
    throw new Error(
      "You're offline. Connect to the internet and try again."
    );
  }

  const data =
    await response.json().catch(() => null);

  if (!response.ok) {
    const message = String(
      data?.message ||
      data?.error ||
      ""
    ).toLowerCase();

    if (
      response.status === 401 ||
      response.status === 403
    ) {
      throw new Error(
        "Your session has expired. Please sign in again."
      );
    }

    if (
      message.includes("already exists") ||
      message.includes("duplicate")
    ) {
      throw new Error(
        "A business with this information already exists."
      );
    }

    throw new Error(
      "Unable to set up your business. Please try again."
    );
  }

  return data;
}

function persistBusinessOnboardingContext() {
  try {
    sessionStorage.setItem(
      "outsider_onboarding_business",
      JSON.stringify({
        businessName:
          onboardingBusinessState.businessName.trim(),
        businessLocation:
          onboardingBusinessState.businessLocation.trim(),
        locationData:
          onboardingBusinessState.locationData,
        vendorType:
          onboardingBusinessState.vendorType
      })
    );
  } catch {
    // Session storage is supplementary. The authenticated API remains authoritative.
  }
}

function bindSetupBusinessEvents() {
  const form =
    document.getElementById("setup-business-form");

  const businessName =
    document.getElementById("business-name");

  const businessLocation =
    document.getElementById("business-location");

  const backButton =
    document.getElementById("setup-business-back");

  businessName.addEventListener("input", (event) => {
    onboardingBusinessState.businessName =
      event.target.value;

    onboardingBusinessState.validation.businessName = "";
    onboardingBusinessState.error = "";

    updateSetupBusinessSubmitState();
  });

  businessLocation.addEventListener("input", (event) => {
    onboardingBusinessState.businessLocation =
      event.target.value;

    onboardingBusinessState.locationData = {
      displayName: event.target.value,
      address: event.target.value,
      latitude: null,
      longitude: null,
      placeId: ""
    };

    onboardingBusinessState.validation.businessLocation = "";
    onboardingBusinessState.error = "";

    updateSetupBusinessSubmitState();
  });

  document
    .querySelectorAll("[data-vendor-type]")
    .forEach((option) => {
      option.addEventListener("click", () => {
        onboardingBusinessState.vendorType =
          option.dataset.vendorType;

        onboardingBusinessState.validation.vendorType = "";
        onboardingBusinessState.error = "";

        renderSetupBusiness();
      });
    });

  backButton.addEventListener("click", () => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    window.location.href = "/signup";
  });

  form.addEventListener(
    "submit",
    handleSetupBusinessSubmit
  );

  updateSetupBusinessSubmitState();
}

async function handleSetupBusinessSubmit(event) {
  event.preventDefault();

  if (onboardingBusinessState.loading) {
    return;
  }

  if (!validateSetupBusiness()) {
    renderSetupBusiness();
    return;
  }

  onboardingBusinessState.loading = true;
  onboardingBusinessState.error = "";
  renderSetupBusiness();

  const businessType =
    onboardingBusinessState.vendorType === "SINGLE_VENDOR"
      ? "single_stall"
      : "multi_vendor";

  try {
    const result = await createBusiness(
      onboardingBusinessState.businessName.trim(),
      businessType
    );

    const createdBusiness =
      result?.business ||
      result?.data?.business ||
      null;

    if (createdBusiness?.id) {
      onboardingBusinessState.createdBusinessId =
        createdBusiness.id;
    }

    persistBusinessOnboardingContext();

    window.location.href = "/onboarding/payment-method";
  } catch (error) {
    onboardingBusinessState.loading = false;
    onboardingBusinessState.error =
      error instanceof Error
        ? error.message
        : "Unable to set up your business. Please try again.";

    renderSetupBusiness();
  }
}

function renderSetupBusiness() {
  app.innerHTML = SetupBusinessScreen();
  bindSetupBusinessEvents();
}

function bindLoginEvents() {
  const form = document.getElementById("login-form");
  const identifier = document.getElementById("identifier");
  const password = document.getElementById("password");
  const methodToggle = document.getElementById("method-toggle");
  const passwordToggle = document.getElementById("password-toggle");
  const backButton = document.getElementById("back-button");

  identifier.addEventListener("input", (event) => {
    setIdentifierValue(event.target.value);
    state.validation.identifier = "";
    state.error = "";

    if (state.identifierMode === "mobile") {
      const formatted = formatLoginPhoneNumber(state.mobile);
      event.target.value = formatted;
      try {
        event.target.setSelectionRange(formatted.length, formatted.length);
      } catch {}
    }

    updateSubmitState();
  });

  password.addEventListener("input", (event) => {
    state.password = event.target.value;
    state.validation.password = "";
    state.error = "";
    updateSubmitState();
  });

  methodToggle.addEventListener("click", () => {
    state.identifierMode =
      state.identifierMode === "email" ? "mobile" : "email";
    state.validation.identifier = "";
    state.error = "";
    state.countryPickerOpen = false;
    state.countrySearch = "";
    renderLogin();

    if (state.identifierMode === "mobile") {
      void loadLoginCountries();
    }

    document.getElementById("identifier")?.focus();
  });

  const countryButton = document.getElementById("login-country-button");
  const countrySearch = document.getElementById("login-country-search");
  const countryDropdown = document.getElementById("login-country-dropdown");

  if (countryButton) {
    countryButton.addEventListener("click", () => {
      document.getElementById("identifier")?.blur();
      state.countryPickerOpen = !state.countryPickerOpen;
      state.countrySearch = "";
      state.error = "";
      renderLogin();

      if (state.countryPickerOpen) {
        void loadLoginCountries();
        document.getElementById("login-country-search")?.focus();
        positionLoginCountryDropdown();
      } else {
        document.getElementById("identifier")?.focus();
      }
    });
  }

  if (countrySearch) {
    countrySearch.addEventListener("input", (event) => {
      state.countrySearch = event.target.value;
      renderLogin();
      document.getElementById("login-country-search")?.focus();
      positionLoginCountryDropdown();
    });
  }

  if (countryDropdown) {
    countryDropdown.addEventListener("click", (event) => {
      event.stopPropagation();
    });
  }

  if (state.countryPickerOpen) {
    positionLoginCountryDropdown();
    window.addEventListener("resize", positionLoginCountryDropdown);
    window.addEventListener("scroll", positionLoginCountryDropdown, true);

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || !state.countryPickerOpen) return;
      state.countryPickerOpen = false;
      state.countrySearch = "";
      renderLogin();
    }, { once: true });

    form.addEventListener("click", (event) => {
      if (
        event.target.closest("#login-country-dropdown") ||
        event.target.closest("#login-country-button")
      ) return;

      state.countryPickerOpen = false;
      state.countrySearch = "";
      renderLogin();
    });
  }

  document.querySelectorAll("[data-login-country-iso]").forEach((option) => {
    option.addEventListener("click", () => {
      const country = signupCountries.find(
        (item) => item.isoCode === option.dataset.loginCountryIso
      );

      if (!country) return;

      state.selectedCountry = country;
      state.selectedCountryCode = country.callingCode;
      state.countryPickerOpen = false;
      state.countrySearch = "";
      state.validation.identifier = "";
      state.error = "";
      renderLogin();
      document.getElementById("identifier")?.focus();
      updateSubmitState();
    });
  });

  passwordToggle.addEventListener("click", () => {
    state.showPassword = !state.showPassword;
    renderLogin();

    const nextPassword = document.getElementById("password");
    nextPassword.focus();
    nextPassword.setSelectionRange(
      nextPassword.value.length,
      nextPassword.value.length
    );
  });

  backButton.addEventListener("click", () => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    window.location.href = "/login";
  });

  document.getElementById("facebook-login").addEventListener("click", () => {
    state.error = "Facebook login is not configured yet.";
    renderLogin();
  });

  document.getElementById("instagram-login").addEventListener("click", () => {
    state.error = "Instagram login is not configured yet.";
    renderLogin();
  });

  document.getElementById("google-login").addEventListener("click", () => {
    state.error = "Google login is not configured yet.";
    renderLogin();
  });

  form.addEventListener("submit", handleLoginSubmit);
  updateSubmitState();
}

function updateSignupSubmitState() {
  const button = document.getElementById("signup-submit");

  if (!button || signupState.loading) {
    return;
  }

  const identifier = getSignupIdentifierValue().trim();
  const validIdentifier =
    signupState.identifierMode === "email"
      ? isValidEmail(identifier)
      : isValidMobileNumber(
          signupState.selectedCountry,
          signupState.phoneNumber
        );

  const validUsername = signupState.username.trim().length > 0;
  const validPassword = signupState.password.length > 0;
  const validConfirmation =
    signupState.confirmPassword.length > 0 &&
    signupState.confirmPassword === signupState.password;

  button.disabled =
    !validIdentifier ||
    !validUsername ||
    !validPassword ||
    !validConfirmation;
}

function validateSignup() {
  signupState.validation.identifier = "";
  signupState.validation.username = "";
  signupState.validation.password = "";
  signupState.validation.confirmPassword = "";
  signupState.error = "";

  const identifier = getSignupIdentifierValue().trim();

  if (!identifier) {
    signupState.validation.identifier =
      signupState.identifierMode === "email"
        ? "Email address is required"
        : "Mobile number is required";
  } else if (
    signupState.identifierMode === "email" &&
    !isValidEmail(identifier)
  ) {
    signupState.validation.identifier = "Enter a valid email address";
  } else if (
    signupState.identifierMode === "mobile" &&
    !isValidMobileNumber(signupState.selectedCountry, signupState.phoneNumber)
  ) {
    signupState.validation.identifier = "Enter a valid mobile number for the selected country";
  }

  if (!signupState.username.trim()) {
    signupState.validation.username = "Username is required";
  }

  if (!signupState.password) {
    signupState.validation.password = "Password is required";
  } else if (signupState.password.length < 8) {
    signupState.validation.password =
      "Password must be at least 8 characters";
  }

  if (!signupState.confirmPassword) {
    signupState.validation.confirmPassword = "Confirm your password";
  } else if (
    signupState.confirmPassword !== signupState.password
  ) {
    signupState.validation.confirmPassword = "Passwords do not match";
  }

  return !Object.values(signupState.validation).some(Boolean);
}

async function signUpWithEmail(email, username, password) {
  if (isOutsiderTestEmail(email)) {
    if (!isOutsiderTestAccount(email, password)) {
      throw new Error("This email is reserved for the Outsider test account.");
    }

    startOutsiderTestSession();
    return {
      testAccount: true,
      user: {
        name: OUTSIDER_TEST_ACCOUNT.username,
        email: OUTSIDER_TEST_ACCOUNT.email
      }
    };
  }

  let response;

  try {
    response = await fetch(`${API}/api/auth/sign-up/email`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        name: username,
        email,
        password
      })
    });
  } catch {
    throw new Error("You're offline. Connect to the internet to sign up.");
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message = String(data?.message || data?.error || "").toLowerCase();

    if (
      response.status === 409 ||
      message.includes("already") ||
      message.includes("exist") ||
      message.includes("taken")
    ) {
      if (message.includes("username")) {
        throw new Error("Username is already in use");
      }

      throw new Error("An account already exists with this email address.");
    }

    if (response.status === 400 || response.status === 422) {
      throw new Error("Unable to create account with these details.");
    }

    throw new Error("Unable to sign up right now. Please try again.");
  }

  return data;
}

async function bindSignupEvents() {
  const form = document.getElementById("signup-form");
  const identifier = document.getElementById("signup-identifier");
  const username = document.getElementById("signup-username");
  const password = document.getElementById("signup-password");
  const confirmPassword = document.getElementById("signup-confirm-password");
  const methodToggle = document.getElementById("signup-method-toggle");
  const passwordToggle = document.getElementById("signup-password-toggle");
  const confirmPasswordToggle = document.getElementById("signup-confirm-password-toggle");
  const backButton = document.getElementById("signup-back-button");

  identifier.addEventListener("input", (event) => {
    setSignupIdentifierValue(event.target.value);
    signupState.validation.identifier = "";
    signupState.error = "";

    if (signupState.identifierMode === "mobile") {
      const formatted = formatPhoneNumber(signupState.phoneNumber);
      event.target.value = formatted;
      try {
        event.target.setSelectionRange(formatted.length, formatted.length);
      } catch {
        // Some mobile browsers do not allow selection updates during input.
      }
    }

    updateSignupSubmitState();
  });

  username.addEventListener("input", (event) => {
    signupState.username = event.target.value;
    signupState.validation.username = "";
    signupState.error = "";
    updateSignupSubmitState();
  });

  password.addEventListener("input", (event) => {
    signupState.password = event.target.value;
    signupState.validation.password = "";
    signupState.validation.confirmPassword = "";
    signupState.error = "";
    updateSignupSubmitState();
  });

  confirmPassword.addEventListener("input", (event) => {
    signupState.confirmPassword = event.target.value;
    signupState.validation.confirmPassword = "";
    signupState.error = "";
    updateSignupSubmitState();
  });

  methodToggle.addEventListener("click", () => {
    signupState.identifierMode =
      signupState.identifierMode === "email" ? "mobile" : "email";
    signupState.validation.identifier = "";
    signupState.error = "";
    renderSignup();

    document.getElementById("signup-identifier").focus();
  });

  const countryButton = document.getElementById("signup-country-button");
  const countrySearch = document.getElementById("signup-country-search");
  const countryDropdown = document.getElementById("signup-country-dropdown");

  if (countryButton) {
    countryButton.addEventListener("click", () => {
      document.getElementById("signup-identifier")?.blur();
      signupState.countrySelectorOpen = !signupState.countrySelectorOpen;
      signupState.countrySearch = "";

      if (!signupState.countrySelectorOpen) {
        renderSignup();
        document.getElementById("signup-identifier")?.focus();
        return;
      }

      signupState.error = "";
      renderSignup();
      void loadSignupCountries();
      document.getElementById("signup-country-search")?.focus();
      positionSignupCountryDropdown();
    });
  }

  if (countrySearch) {
    countrySearch.addEventListener("input", (event) => {
      signupState.countrySearch = event.target.value;
      renderSignup();
      document.getElementById("signup-country-search")?.focus();
      positionSignupCountryDropdown();
    });
  }

  if (countryDropdown) {
    countryDropdown.addEventListener("click", (event) => {
      event.stopPropagation();
    });
  }

  if (signupState.countrySelectorOpen) {
    positionSignupCountryDropdown();

    window.addEventListener("resize", positionSignupCountryDropdown);
    window.addEventListener("scroll", positionSignupCountryDropdown, true);

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || !signupState.countrySelectorOpen) {
        return;
      }

      signupState.countrySelectorOpen = false;
      signupState.countrySearch = "";
      renderSignup();
    }, { once: true });
  }

  if (signupState.countrySelectorOpen) {
    form.addEventListener("click", (event) => {
      if (
        event.target.closest("#signup-country-dropdown") ||
        event.target.closest("#signup-country-button")
      ) {
        return;
      }

      signupState.countrySelectorOpen = false;
      signupState.countrySearch = "";
      renderSignup();
    });
  }

  document.querySelectorAll("[data-country-iso]").forEach((option) => {
    option.addEventListener("click", () => {
      const country = signupCountries.find(
        (item) => item.isoCode === option.dataset.countryIso
      );

      if (!country) {
        return;
      }

      signupState.selectedCountry = country;
      signupState.selectedCountryCode = country.callingCode;
      signupState.countrySelectorOpen = false;
      signupState.countrySearch = "";
      signupState.validation.identifier = "";
      signupState.error = "";
      renderSignup();
      document.getElementById("signup-identifier")?.focus();
      updateSignupSubmitState();
    });
  });

  passwordToggle.addEventListener("click", () => {
    signupState.showPassword = !signupState.showPassword;
    renderSignup();

    const nextPassword = document.getElementById("signup-password");
    nextPassword.focus();
    nextPassword.setSelectionRange(
      nextPassword.value.length,
      nextPassword.value.length
    );
  });

  confirmPasswordToggle.addEventListener("click", () => {
    signupState.showConfirmPassword =
      !signupState.showConfirmPassword;
    renderSignup();

    const nextConfirmPassword =
      document.getElementById("signup-confirm-password");

    nextConfirmPassword.focus();
    nextConfirmPassword.setSelectionRange(
      nextConfirmPassword.value.length,
      nextConfirmPassword.value.length
    );
  });

  backButton.addEventListener("click", () => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    window.location.href = "/login";
  });

  form.addEventListener("submit", handleSignupSubmit);

  updateSignupSubmitState();
}

async function handleSignupSubmit(event) {
  event.preventDefault();

  if (signupState.loading) {
    return;
  }

  if (!validateSignup()) {
    renderSignup();
    return;
  }

  if (signupState.identifierMode === "mobile") {
    signupState.error =
      "Mobile registration is not available with the current authentication service.";
    renderSignup();
    return;
  }

  signupState.loading = true;
  signupState.error = "";
  renderSignup();

  try {
    await signUpWithEmail(
      signupState.email.trim(),
      signupState.username.trim(),
      signupState.password
    );

    window.location.href = "/onboarding/business";
  } catch (error) {
    signupState.loading = false;
    signupState.error =
      error instanceof Error
        ? error.message
        : "Unable to sign up right now. Please try again.";

    renderSignup();
  }
}

function updateSubmitState() {
  const button = document.getElementById("login-submit");

  if (!button || state.loading) {
    return;
  }

  const identifier = getIdentifierValue().trim();
  const validIdentifier =
    state.identifierMode === "email"
      ? isValidEmail(identifier)
      : identifier.length > 0;

  button.disabled = !validIdentifier || !state.password;
}

function validateLogin() {
  state.validation.identifier = "";
  state.validation.password = "";
  state.error = "";

  const identifier = getIdentifierValue().trim();

  if (!identifier) {
    state.validation.identifier =
      state.identifierMode === "email"
        ? "Email address is required"
        : "Mobile number is required";
  } else if (
    state.identifierMode === "email" &&
    !isValidEmail(identifier)
  ) {
    state.validation.identifier = "Enter a valid email address";
  }

  if (!state.password) {
    state.validation.password = "Password is required";
  }

  return !state.validation.identifier && !state.validation.password;
}

async function signInWithEmail(email, password) {
  if (isOutsiderTestAccount(email, password)) {
    startOutsiderTestSession();
    return {
      testAccount: true,
      user: {
        name: OUTSIDER_TEST_ACCOUNT.username,
        email: OUTSIDER_TEST_ACCOUNT.email
      }
    };
  }

  let response;

  try {
    response = await fetch(`${API}/api/auth/sign-in/email`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({ email, password })
    });
  } catch {
    throw new Error("You're offline. Connect to the internet to log in.");
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    if (response.status === 401 || response.status === 400) {
      throw new Error("Incorrect email or password");
    }

    throw new Error("Unable to log in right now. Please try again.");
  }

  return data;
}

async function getSession() {
  if (hasOutsiderTestSession()) {
    return {
      user: {
        name: OUTSIDER_TEST_ACCOUNT.username,
        email: OUTSIDER_TEST_ACCOUNT.email,
        testAccount: true
      }
    };
  }

  let response;

  try {
    response = await fetch(`${API}/api/me`, {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" }
    });
  } catch {
    throw new Error("You're offline. Connect to the internet to log in.");
  }

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error("Unable to check authentication");
  }

  return response.json();
}

async function getBusinesses() {
  if (hasOutsiderTestSession()) {
    try {
      const raw = sessionStorage.getItem(OUTSIDER_TEST_BUSINESS_KEY);
      const business = raw ? JSON.parse(raw) : null;
      return { businesses: business ? [business] : [] };
    } catch {
      return { businesses: [] };
    }
  }

  let response;

  try {
    response = await fetch(`${API}/api/businesses`, {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" }
    });
  } catch {
    throw new Error("You're offline. Connect to the internet to log in.");
  }

  if (!response.ok) {
    throw new Error("Unable to load businesses");
  }

  return response.json();
}

async function handleLoginSubmit(event) {
  event.preventDefault();

  if (state.loading) {
    return;
  }

  if (!validateLogin()) {
    renderLogin();
    return;
  }

  if (state.identifierMode === "mobile") {
    state.error =
      "Mobile login is not available yet. Please use your email address.";
    renderLogin();
    return;
  }

  state.loading = true;
  state.error = "";
  renderLogin();

  try {
    await signInWithEmail(
      state.email.trim(),
      state.password
    );

    const session = await getSession();

    if (!session?.user) {
      throw new Error(
        "Your session could not be established. Please sign in again."
      );
    }

    const data = await getBusinesses();

    if (!data.businesses?.length) {
      window.location.href = "/onboarding/business";
      return;
    }

    if (data.businesses.length === 1) {
      window.location.href = "/home";
      return;
    }

    window.location.href = "/businesses";
  } catch (error) {
    state.loading = false;
    state.error =
      error instanceof Error
        ? error.message
        : "Incorrect email or password";

    renderLogin();
  }
}

async function checkExistingSession() {
  try {
    const session = await getSession();

    if (!session?.user) {
      return;
    }

    const data = await getBusinesses();

    if (!data.businesses?.length) {
      window.location.href = "/onboarding/business";
      return;
    }

    if (data.businesses.length === 1) {
      window.location.href = "/home";
      return;
    }

    window.location.href = "/businesses";
  } catch {
    // Keep the Login screen visible if the initial session check fails.
  }
}

function getCurrentRoute() {
  const path = window.location.pathname.replace(/\/+$/, "");
  return path || "/";
}

function bindProviderLogoAssetEvents() {
  if (window.__outsiderProviderLogoEventsBound) return;
  window.__outsiderProviderLogoEventsBound = true;

  document.addEventListener("load", (event) => {
    const image = event.target;
    if (!image?.classList?.contains("payment-provider-logo-image")) return;

    image.style.display = "block";
    const fallback = image.previousElementSibling;
    if (fallback) fallback.style.display = "none";
  }, true);

  document.addEventListener("error", (event) => {
    const image = event.target;
    if (!image?.classList?.contains("payment-provider-logo-image")) return;

    image.style.display = "none";
    const fallback = image.previousElementSibling;
    if (fallback) fallback.style.display = "flex";
  }, true);
}

function init() {
  bindProviderLogoAssetEvents();
  const route = getCurrentRoute();

  if (route === "/" || route === "/login") {
    renderLogin();
    return;
  }

  if (route === "/signup") {
    renderSignup();
    return;
  }

  if (route === "/onboarding/business") {
    renderSetupBusiness();
    return;
  }

  if (route === "/onboarding/payment-method") {
    loadPaymentSetupState();
    renderSetupPaymentMethod();
    return;
  }

  if (route === "/onboarding/kyc") {
    loadKycState();
    renderKyc();
    return;
  }

  if (route === "/home") {
    homeState.availabilityStatus = getStoredHomeAvailability();
    renderHome();
    return;
  }

  renderPlaceholder();
}

init();
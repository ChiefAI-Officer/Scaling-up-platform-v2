import "@testing-library/jest-dom";

// Polyfill for Request/Response in Node.js test environment
if (typeof Request === "undefined") {
  global.Request = class Request {
    constructor(url, options = {}) {
      this.url = url;
      this.method = options.method || "GET";
      this.headers = new Map(Object.entries(options.headers || {}));
      this._body = options.body;
    }
    async json() {
      return JSON.parse(this._body || "{}");
    }
    get(header) {
      return this.headers.get(header.toLowerCase());
    }
  };
}

if (typeof Response === "undefined") {
  global.Response = class Response {
    constructor(body, options = {}) {
      this._body = body;
      this.status = options.status || 200;
      this.headers = new Map(Object.entries(options.headers || {}));
    }
    async json() {
      return typeof this._body === "string" ? JSON.parse(this._body) : this._body;
    }
  };
}

// Mock Next.js router
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    refresh: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
  }),
  useSearchParams: () => ({
    get: jest.fn(),
  }),
  usePathname: () => "/",
}));

// Mock next-auth
jest.mock("next-auth/react", () => ({
  useSession: jest.fn(() => ({
    data: null,
    status: "unauthenticated",
  })),
  signIn: jest.fn(),
  signOut: jest.fn(),
  SessionProvider: ({ children }) => children,
}));

// Suppress console errors during tests (can be removed for debugging)
const originalError = console.error;
beforeAll(() => {
  console.error = (...args) => {
    if (
      typeof args[0] === "string" &&
      args[0].includes("Warning: ReactDOM.render is no longer supported")
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});

const mockExec = jest.fn();

jest.mock("ioredis", () => {
  const pipeline = {
    zadd: jest.fn(),
    zremrangebyscore: jest.fn(),
    zcard: jest.fn(),
    pexpire: jest.fn(),
    exec: (...args: unknown[]) => mockExec(...args),
  };
  return {
    __esModule: true,
    default: jest.fn(() => ({
      on: jest.fn(),
      pipeline: () => pipeline,
    })),
  };
});

import { checkRateLimitStrict } from "@/lib/rate-limit";

const config = { interval: 60_000, maxRequests: 10 };
const successfulPipeline = (count: number) => [
  [null, 1],
  [null, 1],
  [null, count],
  [null, 1],
];

beforeAll(() => {
  process.env.REDIS_URL = "redis://rate-limit.test";
});

afterAll(() => {
  delete process.env.REDIS_URL;
});

beforeEach(() => {
  mockExec.mockReset();
});

it("returns the distributed count when the strict backend succeeds", async () => {
  mockExec.mockResolvedValue(successfulPipeline(3));

  await expect(
    checkRateLimitStrict("referred-results-export:coach-1", config),
  ).resolves.toMatchObject({
    success: true,
    remaining: 7,
  });
});

it("blocks the request when the distributed count exceeds the limit", async () => {
  mockExec.mockResolvedValue(successfulPipeline(11));

  await expect(
    checkRateLimitStrict("referred-results-export:coach-1", config),
  ).resolves.toMatchObject({
    success: false,
    remaining: 0,
    retryAfter: 60,
  });
});

it("propagates backend failures instead of failing open", async () => {
  mockExec.mockRejectedValue(new Error("redis unavailable"));

  await expect(
    checkRateLimitStrict("referred-results-export:coach-1", config),
  ).rejects.toThrow("redis unavailable");
});

it("propagates command errors returned by the Redis pipeline", async () => {
  mockExec.mockResolvedValue([
    [new Error("zadd failed"), null],
    [null, 1],
    [null, 1],
    [null, 1],
  ]);

  await expect(
    checkRateLimitStrict("referred-results-export:coach-1", config),
  ).rejects.toThrow("zadd failed");
});

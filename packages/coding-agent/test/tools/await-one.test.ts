import { describe, expect, it } from "bun:test";
import type { AsyncJob, AsyncJobManager } from "../../src/async/job-manager";
import type { ToolSession } from "../../src/tools";
import { AwaitTool, type AwaitToolDetails } from "../../src/tools/await-tool";

// ─────────────────────────────────────────────────────────────────────────────
// Minimal fakes for AsyncJobManager + ToolSession.
// The real classes bring wide surface area (timers, deliveries, storage);
// AwaitTool.execute only touches a small slice, so we duck-type that slice.
// ─────────────────────────────────────────────────────────────────────────────

function mkRunningJob(
	id: string,
	opts?: { label?: string },
): { job: AsyncJob; complete: () => void; fail: (msg: string) => void } {
	const { promise, resolve } = Promise.withResolvers<void>();
	const job: AsyncJob = {
		id,
		type: "bash",
		status: "running",
		startTime: Date.now(),
		label: opts?.label ?? `bash:${id}`,
		abortController: new AbortController(),
		promise,
	};
	return {
		job,
		complete: () => {
			job.status = "completed";
			job.resultText = `${id} done`;
			resolve();
		},
		fail: msg => {
			job.status = "failed";
			job.errorText = msg;
			resolve();
		},
	};
}

function mkManager(jobs: AsyncJob[]): AsyncJobManager {
	const byId = new Map(jobs.map(j => [j.id, j]));
	const acknowledged: string[] = [];
	return {
		getJob: (id: string) => byId.get(id),
		getRunningJobs: () => [...byId.values()].filter(j => j.status === "running"),
		acknowledgeDeliveries: (ids: string[]) => {
			acknowledged.push(...ids);
			return ids.length;
		},
	} as unknown as AsyncJobManager;
}

interface FakeSessionHandles {
	session: ToolSession;
	notifyQueuedMessage: () => void;
}

function mkSession(manager: AsyncJobManager | undefined): FakeSessionHandles {
	const waiters = new Set<() => void>();
	const notifyQueuedMessage = () => {
		const toResolve = Array.from(waiters);
		waiters.clear();
		for (const r of toResolve) r();
	};
	const session = {
		asyncJobManager: manager,
		waitForQueuedMessage: (signal?: AbortSignal) => {
			if (signal?.aborted) return Promise.resolve();
			const { promise, resolve } = Promise.withResolvers<void>();
			waiters.add(resolve);
			signal?.addEventListener(
				"abort",
				() => {
					waiters.delete(resolve);
					resolve();
				},
				{ once: true },
			);
			return promise;
		},
		settings: { get: () => true },
	} as unknown as ToolSession;
	return { session, notifyQueuedMessage };
}

// ─────────────────────────────────────────────────────────────────────────────

describe("await_one", () => {
	it("returns wakeReason 'job_event' when a watched job completes", async () => {
		const { job, complete } = mkRunningJob("j1");
		const manager = mkManager([job]);
		const { session } = mkSession(manager);
		const tool = new AwaitTool(session);

		const resultPromise = tool.execute("tc1", { timeoutSec: 30 });
		queueMicrotask(complete);

		const result = await resultPromise;
		const details = result.details as AwaitToolDetails;
		expect(details.wakeReason).toBe("job_event");
		expect(details.jobs[0]?.status).toBe("completed");
	});

	it("returns wakeReason 'pending_message' when a user message is queued mid-await", async () => {
		const { job, complete } = mkRunningJob("j1");
		const manager = mkManager([job]);
		const { session, notifyQueuedMessage } = mkSession(manager);
		const tool = new AwaitTool(session);

		const resultPromise = tool.execute("tc1", { timeoutSec: 30 });
		// Notify AFTER the tool has had a chance to register the waiter.
		await new Promise(r => setTimeout(r, 5));
		notifyQueuedMessage();

		const result = await resultPromise;
		const details = result.details as AwaitToolDetails;
		expect(details.wakeReason).toBe("pending_message");
		// Critical: job keeps running — await_one is non-cancelling.
		expect(job.status).toBe("running");
		expect(details.jobs[0]?.status).toBe("running");
		// Don't leave the job hanging for the test runner.
		complete();
	});

	it("returns wakeReason 'timeout' when neither jobs nor messages fire", async () => {
		const { job, complete } = mkRunningJob("j1");
		const manager = mkManager([job]);
		const { session } = mkSession(manager);
		const tool = new AwaitTool(session);

		// 1s timeout is enough to exercise the code path without slowing the suite.
		const result = await tool.execute("tc1", { timeoutSec: 1 });
		const details = result.details as AwaitToolDetails;
		expect(details.wakeReason).toBe("timeout");
		expect(job.status).toBe("running");
		complete();
	});

	it("returns wakeReason 'aborted' when the AbortSignal fires", async () => {
		const { job, complete } = mkRunningJob("j1");
		const manager = mkManager([job]);
		const { session } = mkSession(manager);
		const tool = new AwaitTool(session);
		const controller = new AbortController();

		const resultPromise = tool.execute("tc1", { timeoutSec: 30 }, controller.signal);
		await new Promise(r => setTimeout(r, 5));
		controller.abort();

		const result = await resultPromise;
		const details = result.details as AwaitToolDetails;
		expect(details.wakeReason).toBe("aborted");
		expect(job.status).toBe("running");
		complete();
	});

	it("returns immediately with wakeReason 'no_running_jobs' when nothing matches", async () => {
		const manager = mkManager([]);
		const { session } = mkSession(manager);
		const tool = new AwaitTool(session);

		const result = await tool.execute("tc1", {});
		const details = result.details as AwaitToolDetails;
		expect(details.wakeReason).toBe("no_running_jobs");
		expect(details.jobs).toEqual([]);
	});

	it("degrades gracefully when the session does not expose waitForQueuedMessage", async () => {
		const { job, complete } = mkRunningJob("j1");
		const manager = mkManager([job]);
		// Build a session without the optional method — should still complete on job_event.
		const session = { asyncJobManager: manager, settings: { get: () => true } } as unknown as ToolSession;
		const tool = new AwaitTool(session);

		const resultPromise = tool.execute("tc1", { timeoutSec: 30 });
		queueMicrotask(complete);
		const result = await resultPromise;
		expect((result.details as AwaitToolDetails).wakeReason).toBe("job_event");
	});
});

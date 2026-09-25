import { useState, useCallback } from 'react';
import './visualiser.css';
import { buildDemoDeps, runDemoSequence, DemoEvent } from './sequence';
import { AgentState } from '../agents/types';
import { LeaseStatus } from '../core/lease';

const TOTAL_STEPS = 4;

function buildInitialEvents(): DemoEvent[] {
  const deps = buildDemoDeps();
  const events: DemoEvent[] = [];
  runDemoSequence(deps, (e) => events.push(e));
  return events;
}

// ── StatusBadge ──────────────────────────────────────────────────────────────

interface BadgeProps {
  status: LeaseStatus | null;
}

function StatusBadge({ status }: BadgeProps) {
  if (!status) {
    return <span className="status-badge none">—</span>;
  }
  const cls = status.toLowerCase();
  const icon = status === LeaseStatus.ACTIVE ? '●' : status === LeaseStatus.STALE ? '⛔' : '✕';
  return (
    <span className={`status-badge ${cls}`}>
      {icon} {status}
    </span>
  );
}

// ── AgentCard ────────────────────────────────────────────────────────────────

interface CardProps {
  state: AgentState;
  /** Previous state — used to show the stale lease history for frontend */
  prevLeaseId?: string | null;
}

function AgentCard({ state, prevLeaseId }: CardProps) {
  const cardClass = [
    'agent-card',
    state.leaseStatus === LeaseStatus.ACTIVE ? 'is-active' : '',
    state.leaseStatus === LeaseStatus.STALE ? 'is-stale' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const showHistory =
    prevLeaseId &&
    state.currentLeaseId !== prevLeaseId &&
    state.leaseStatus === LeaseStatus.ACTIVE;

  return (
    <div className={cardClass}>
      <div className="agent-name">{state.agentId}</div>
      <StatusBadge status={state.leaseStatus} />
      {state.currentLeaseId && (
        <div className="lease-id">
          {state.currentLeaseId}
        </div>
      )}
      {showHistory && (
        <div className="stale-history">
          <span className="sh-label">Old lease (STALE): </span>
          {prevLeaseId}
        </div>
      )}
      <div className="last-action">{state.lastAction}</div>
      {state.errorMessage && (
        <div className="error-msg">{state.errorMessage}</div>
      )}
    </div>
  );
}

// ── PactVisualiser ───────────────────────────────────────────────────────────

export function PactVisualiser() {
  const [events, setEvents] = useState<DemoEvent[]>(() => buildInitialEvents());
  const [step, setStep] = useState(0);

  const currentEvent = step > 0 ? events[step - 1] : null;

  // Track frontend's initial lease ID so we can show the stale history after reissue
  const frontendInitialLeaseId = events[0]?.agentStates.find((s) => s.agentId === 'frontend')?.currentLeaseId;

  const handleNext = useCallback(() => {
    setStep((s) => Math.min(s + 1, TOTAL_STEPS));
  }, []);

  const handleReset = useCallback(() => {
    const freshEvents: DemoEvent[] = [];
    const deps = buildDemoDeps();
    runDemoSequence(deps, (e) => freshEvents.push(e));
    setEvents(freshEvents);
    setStep(0);
  }, []);

  const agentStates: AgentState[] = currentEvent?.agentStates ?? [];

  return (
    <div className="pact-root">
      {/* Header */}
      <div className="pact-header">
        <h1>PACT ContextLease</h1>
        <p>IBM Bob Hackathon — simulated parallel coding agents</p>
        <span className="pact-notice">
          ⚠ Prototype only — not a direct IBM Bob integration
        </span>
      </div>

      {/* Controls */}
      <div className="pact-controls">
        <button
          className="btn btn-primary"
          onClick={handleNext}
          disabled={step >= TOTAL_STEPS}
        >
          ▶ Next Step
        </button>
        <button className="btn btn-secondary" onClick={handleReset}>
          ↺ Reset
        </button>
        <span className="step-counter">
          {step === 0 ? 'Press Next Step to begin' : `Step ${step} / ${TOTAL_STEPS}`}
        </span>
      </div>

      {/* Step description */}
      <div className="pact-description">
        {currentEvent?.description ?? 'Waiting to start…'}
      </div>

      {/* Agent columns */}
      {step > 0 && (
        <div className="pact-grid">
          {agentStates.map((s) => (
            <AgentCard
              key={s.agentId}
              state={s}
              prevLeaseId={
                s.agentId === 'frontend' ? frontendInitialLeaseId : undefined
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

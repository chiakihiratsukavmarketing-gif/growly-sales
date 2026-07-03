import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ExternalLeadCandidate } from '../adapters/externalLeadCandidateTypes.js';
import {
  allCandidatesDeferred,
  applyDeferredOrder,
  sortCandidatesForFocusMode,
  type ApprovalBlockHints,
} from './daily30CandidateFocusMode.js';

export function useCandidateFocusQueue(
  filteredCandidates: ExternalLeadCandidate[],
  approvalBlockHints: ApprovalBlockHints,
  filterKey: string
) {
  const [focusIndex, setFocusIndex] = useState(0);
  const [deferredIds, setDeferredIds] = useState<string[]>([]);
  const [processedCount, setProcessedCount] = useState(0);

  useEffect(() => {
    setFocusIndex(0);
    setDeferredIds([]);
  }, [filterKey]);

  const sortedForFocus = useMemo(
    () => sortCandidatesForFocusMode(filteredCandidates, approvalBlockHints),
    [filteredCandidates, approvalBlockHints]
  );

  const focusQueue = useMemo(
    () => applyDeferredOrder(sortedForFocus, deferredIds),
    [sortedForFocus, deferredIds]
  );

  const allDeferred = useMemo(
    () => allCandidatesDeferred(sortedForFocus, deferredIds),
    [sortedForFocus, deferredIds]
  );

  const safeIndex =
    focusQueue.length === 0 ? 0 : Math.min(focusIndex, focusQueue.length - 1);

  const currentCandidate = focusQueue[safeIndex] ?? null;

  const goPrev = useCallback(() => {
    setFocusIndex((i) => Math.max(0, i - 1));
  }, []);

  const goNext = useCallback(() => {
    setFocusIndex((i) => Math.min(Math.max(0, focusQueue.length - 1), i + 1));
  }, [focusQueue.length]);

  const deferCurrent = useCallback(() => {
    const c = focusQueue[safeIndex];
    if (!c) return;
    setDeferredIds((prev) => {
      if (prev.includes(c.externalCandidateId)) return prev;
      return [...prev, c.externalCandidateId];
    });
  }, [focusQueue, safeIndex]);

  const clearDeferred = useCallback(() => {
    setDeferredIds([]);
    setFocusIndex(0);
  }, []);

  const recordProcessed = useCallback(() => {
    setProcessedCount((n) => n + 1);
  }, []);

  useEffect(() => {
    setFocusIndex((i) => Math.min(i, Math.max(0, focusQueue.length - 1)));
  }, [focusQueue.length]);

  return {
    focusQueue,
    safeIndex,
    currentCandidate,
    allDeferred,
    processedCount,
    goPrev,
    goNext,
    deferCurrent,
    clearDeferred,
    recordProcessed,
    canGoPrev: safeIndex > 0,
    canGoNext: safeIndex < focusQueue.length - 1,
    remainingCount: focusQueue.length,
  };
}

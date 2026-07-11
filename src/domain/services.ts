// @ts-expect-error Canonical ESM concept catalogue.
import { procedures } from './concepts.mjs';
// @ts-expect-error Canonical ESM claim/concept catalogue.
import { granularConcepts } from './claims.mjs';

export const serviceRelationships = ['offered', 'evaluated', 'referral-context'] as const;
export const offeredProcedures = procedures.filter((item: { relationship: string }) => item.relationship === 'offered');
export const evaluatedProcedures = procedures.filter((item: { relationship: string }) => item.relationship === 'evaluated');
export const referralProcedures = procedures.filter((item: { relationship: string }) => item.relationship === 'referral-context');
export const offeredConcepts = granularConcepts.filter((item: { relationship: string }) => item.relationship === 'offered');
export const evaluatedConcepts = granularConcepts.filter((item: { relationship: string }) => item.relationship === 'evaluated');
export const referralConcepts = granularConcepts.filter((item: { relationship: string }) => item.relationship === 'referral-context');

export { procedures, granularConcepts };


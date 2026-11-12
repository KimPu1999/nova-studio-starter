import { describe, expect, it } from 'vitest';
import { hasWorkspacePermission, normalizeWorkspaceSlug } from '../src/lib/workspaces';

describe('workspace authorization boundaries', () => {
  it('keeps viewer permissions read-only', () => {
    expect(hasWorkspacePermission('VIEWER', 'projects.read')).toBe(true);
    expect(hasWorkspacePermission('VIEWER', 'projects.edit')).toBe(false);
    expect(hasWorkspacePermission('VIEWER', 'billing.manage')).toBe(false);
  });

  it('does not give editor billing or member-management access', () => {
    expect(hasWorkspacePermission('EDITOR', 'projects.edit')).toBe(true);
    expect(hasWorkspacePermission('EDITOR', 'members.manage')).toBe(false);
    expect(hasWorkspacePermission('EDITOR', 'billing.manage')).toBe(false);
  });

  it('normalizes workspace slugs', () => {
    expect(normalizeWorkspaceSlug('  My Agency / Team  ')).toBe('my-agency-team');
  });
});

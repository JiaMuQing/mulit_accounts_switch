import type { Profile, ProfileGroup } from "./types";

/** 用户分组按展示顺序排序 */
export function sortedUserGroups(groups: ProfileGroup[]): ProfileGroup[] {
  return [...groups].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

/**
 * 配置列表：先按真实分组（按分组 order），再未分组（groupId 为 null），组内按名称排序
 */
export function sortProfilesByGroupOrder(profiles: Profile[], groups: ProfileGroup[]): Profile[] {
  const orderById = new Map(groups.map((g) => [g.id, g.order] as const));
  const rank = (p: Profile): number => {
    if (!p.groupId) return 1_000_000;
    return orderById.get(p.groupId) ?? 999_999;
  };
  return [...profiles].sort((a, b) => {
    const d = rank(a) - rank(b);
    if (d !== 0) return d;
    return a.name.localeCompare(b.name);
  });
}

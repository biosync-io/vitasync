"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useSelectedUser } from "../../../lib/user-selection-context"
import { type AchievementData, type AchievementDefData, achievementsApi } from "../../../lib/api"
import { PageHeader, Badge, Card, CardHeader, CardContent, Button, EmptyState, CardSkeleton, Select, Input } from "../../../lib/components/ui"

const TIER_STYLES: Record<string, string> = {
  bronze: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-400",
  silver: "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
  gold: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-400",
  platinum: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-400",
  diamond: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-400",
}

const TIER_BADGE_VARIANT: Record<string, "default" | "success" | "warning" | "danger" | "info" | "purple"> = {
  bronze: "warning",
  silver: "default",
  gold: "warning",
  platinum: "info",
  diamond: "purple",
}

export default function AchievementsPage() {
  const { selectedUserId } = useSelectedUser()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<"unlocked" | "catalog">("unlocked")


  const { data: achievementsResult, isLoading } = useQuery({
    queryKey: ["achievements", selectedUserId],
    queryFn: () => achievementsApi.list(selectedUserId),
    enabled: !!selectedUserId,
  })
  const achievements = achievementsResult?.data ?? []

  const { data: defsResult } = useQuery({
    queryKey: ["achievement-definitions"],
    queryFn: () => achievementsApi.definitions(),
  })
  const definitions = defsResult?.data ?? []

  const checkMut = useMutation({
    mutationFn: () => achievementsApi.check(selectedUserId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["achievements", selectedUserId] }),
  })

  return (
    <div className="space-y-8">
      <PageHeader
        title="Achievements"
        subtitle="Unlock badges and milestones as you hit health targets."
        actions={selectedUserId ? <Button onClick={() => checkMut.mutate()} loading={checkMut.isPending}>Check Achievements</Button> : undefined}
      />

      <Card>
        <CardContent>
          <div className="flex gap-1">
            <Button variant={tab === "unlocked" ? "primary" : "secondary"} size="sm" onClick={() => setTab("unlocked")}>Unlocked</Button>
            <Button variant={tab === "catalog" ? "primary" : "secondary"} size="sm" onClick={() => setTab("catalog")}>Catalog</Button>
          </div>
        </CardContent>
      </Card>

      {tab === "unlocked" && selectedUserId && isLoading && <CardSkeleton count={6} />}

      {tab === "unlocked" && selectedUserId && !isLoading && (
        <div>
          <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">{achievements.length} achievement{achievements.length !== 1 ? "s" : ""} unlocked</p>
          {achievements.length === 0 ? (
            <EmptyState title="No achievements unlocked yet" description="Keep hitting health targets to earn badges." />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {achievements.map((a) => (
                <Card key={a.id} hover className="text-center">
                  <CardContent>
                    <div className="text-4xl mb-2">{a.icon || "🏆"}</div>
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">{a.name}</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{a.description}</p>
                    <div className="mt-3 flex items-center justify-center gap-2">
                      <Badge variant={TIER_BADGE_VARIANT[a.tier] ?? "default"}>{a.tier}</Badge>
                      <span className="text-xs text-gray-400">{a.category}</span>
                    </div>
                    <p className="mt-2 text-xs text-gray-400">{new Date(a.unlockedAt).toLocaleDateString()}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "catalog" && (
        <>
          {definitions.length === 0 ? (
            <EmptyState title="No achievement definitions found" />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {definitions.map((d) => {
                const unlocked = achievements.find((a) => a.achievementId === d.id)
                return (
                  <Card key={d.id} className={unlocked ? "" : "opacity-60"}>
                    <CardContent className="text-center">
                      <div className="text-4xl mb-2">{unlocked ? d.icon : "🔒"}</div>
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100">{d.name}</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{d.description}</p>
                      <div className="mt-3">
                        <Badge variant={TIER_BADGE_VARIANT[d.tier] ?? "default"}>{d.tier}</Badge>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

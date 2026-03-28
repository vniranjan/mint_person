import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export interface JobStatusData {
  stage: string;
  transactionCount: number;
  errorMessage: string | null;
}

/**
 * Poll job processing status every 2 seconds.
 * Stops polling when stage is COMPLETE or FAILED.
 * On COMPLETE, invalidates the ["statements"] query cache so the
 * statements list reflects the newly-processed statement.
 */
export function useJobStatus(jobId: string | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["job-status", jobId],
    queryFn: async (): Promise<{ data: JobStatusData }> => {
      const res = await fetch(`/api/jobs/${jobId}/status`);
      if (!res.ok) {
        throw new Error(`Job status fetch failed: ${res.status}`);
      }
      return res.json() as Promise<{ data: JobStatusData }>;
    },
    enabled: !!jobId,
    refetchInterval: (query) => {
      const stage = query.state.data?.data?.stage;
      if (stage === "COMPLETE" || stage === "FAILED") return false;
      return 2000;
    },
  });

  // Invalidate statements cache in a useEffect — not inside refetchInterval —
  // to avoid calling side effects from a pure interval-calculation callback.
  const stage = query.data?.data?.stage;
  useEffect(() => {
    if (stage === "COMPLETE") {
      void queryClient.invalidateQueries({ queryKey: ["statements"] });
    }
  }, [stage, queryClient]);

  return query;
}

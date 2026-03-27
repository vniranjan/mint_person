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

  return useQuery({
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
      if (stage === "COMPLETE") {
        void queryClient.invalidateQueries({ queryKey: ["statements"] });
        return false;
      }
      if (stage === "FAILED") {
        return false;
      }
      return 2000;
    },
  });
}

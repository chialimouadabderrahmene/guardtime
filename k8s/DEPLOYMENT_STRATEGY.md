# Deployment strategy

## Default: rolling update (zero downtime)

Already configured on every Deployment in this directory —
`strategy.rollingUpdate.maxUnavailable: 0`. Kubernetes never drops below
the current replica count during a rollout: it starts new pods, waits for
each one's `readinessProbe` to pass before routing traffic to it, and only
then retires an old pod. Combined with the `preStop` hook on `backend.yaml`
(5s pause before Nest's shutdown hooks start draining), this is a genuine
zero-downtime deploy — no manual steps, just `kubectl set image ...` or a
new image tag applied by CI.

This is the deploy strategy actually wired into `ci.yml`'s `deploy` job.
It's the right default: cheaper to run (no duplicate environment), and
Kubernetes handles the mechanics for you.

## Alternative: blue-green

Not built out as separate manifests here — for 3 stateless services behind
one Ingress, a second full parallel environment is real infrastructure cost
for a benefit (instant, whole-environment rollback) that rolling update's
`kubectl rollout undo` already covers for the common case (a bad deploy,
caught by health checks or monitoring within minutes). Documenting the
procedure here rather than pre-building it, so it exists on paper without
adding a second set of manifests to keep in sync until the day you actually
need instant-cutover-with-full-old-environment-still-warm — which is a
real but narrower need than most teams assume.

If/when you do need it:

1. Deploy the new version as a parallel Deployment with a distinct label,
   e.g. `app: backend, version: green` (copy `backend.yaml`, change
   `metadata.name` to `backend-green` and the label).
2. Wait for it to be fully healthy (`kubectl rollout status
   deployment/backend-green -n guardtime`) — this is your "warm standby,"
   not yet receiving traffic.
3. Cut over by updating the `backend` Service's selector from
   `version: blue` to `version: green`:
   ```
   kubectl patch service backend -n guardtime -p '{"spec":{"selector":{"version":"green"}}}'
   ```
   This is instant — no rolling window, no partial-traffic period.
4. Keep the old (`blue`) Deployment running for a rollback window, then
   scale it to 0 or delete it once you're confident.
5. Rollback, if needed, is the same patch command with `blue`/`green`
   swapped — instant, no waiting on pod restarts.

## What's NOT safe to skip either way

Both strategies depend on the readiness probes actually reflecting real
health (`/health/ready` checking DB+Redis+Firebase — already wired) and on
`PodDisruptionBudget` (`backend.yaml`, `minAvailable: 2`) preventing a
voluntary disruption (node drain, cluster autoscaler) from taking out too
many pods at once regardless of which deploy strategy triggered it.

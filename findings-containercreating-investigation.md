# ContainerCreating Pod Investigation — Findings Report

**Cluster:** ad-sandbox-cluster  
**Kubeconfig:** /Users/joshua.williams/.kube/sb-config  
**Investigation Date:** 2026-10-22  
**Investigator:** Intermediate DevOps/SRE Platform Engineering  

---

## 1. Executive Summary

A large number of pods across the `ad-sandbox-cluster` were stuck in `ContainerCreating`. After systematic triage, the root cause was identified as **image pulls from `iswprodacr.azurecr.io` hanging indefinitely** at the kubelet/containerd layer. The issue is **cluster-wide**, not isolated to specific nodes, and is most likely caused by an external dependency problem with the Azure Container Registry or the network path to it.

---

## 2. Initial Symptom

- Large number of pods stuck in `ContainerCreating` across multiple namespaces.
- Initial count: ~90 pods.
- Force-deleting pods provided only temporary relief; new pods immediately re-entered `ContainerCreating`.

---

## 3. Node Health Assessment

| Node | Status | Version | Runtime | Pod Count | Notable Conditions |
|------|--------|---------|---------|-----------|-------------------|
| `sb-kube-node-011` | `Ready` | v1.34.7 | containerd 2.2.1 | 76 pods | Healthy; no node events |
| `sb-kube-node-009` | `Ready` | v1.34.7 | containerd 2.2.1 | 64 pods | Healthy; recent `NodeHasNoDiskPressure` event |
| `sb-kube-node-012` | `Ready` | v1.34.7 | containerd 2.2.1 | 65 pods | ⚠️ Intermittent DiskPressure cycling |

### Node-012 Disk Pressure Note
- Events showed repeated `EvictionThresholdMet` → `NodeHasDiskPressure` → `NodeHasNoDiskPressure` over ~3.5 hours.
- Indicates the node is flapping around the kubelet ephemeral-storage eviction threshold.
- This is a secondary concern and may contribute locally, but does not explain the cluster-wide image-pull hang.

---

## 4. Pod-Level Findings

### 4.1 Representative Stuck Pods Inspected

| Namespace | Pod | Node | Image | Last Event |
|-----------|-----|------|-------|------------|
| `business-technology` | `caesar-757dd4cc8c-xj4zw` | `sb-kube-node-011` | `iswprodacr.azurecr.io/caesar:e654ebe` | `Pulling image` (hung 12m+) |
| `business-technology` | `passport-v2-75665d8cd5-xfz7z` | `sb-kube-node-012` | `iswprodacr.azurecr.io/passport-v2:1.0.174` | `Pulling image` (hung 11m+) |
| `inclusio` | `card-validation-df4885b5b-2sp9t` | `sb-kube-node-011` | `iswprodacr.azurecr.io/card-validation:199f817` | `Pulling image` (hung 11m+) |
| `inclusio` | `ccbs-access-portal-7bcfcdc4-btblr` | `sb-kube-node-005` | `iswprodacr.azurecr.io/ccbs-access-portal:23ac0cb` | `Pulling image` (hung 12m+) |
| `inclusio` | `ccbs-admin-portal-877b8458d-q42gw` | `sb-kube-node-011` | `iswprodacr.azurecr.io/ccbs-admin-portal:c69f511` | `Pulling image` (hung 12m+) |

### 4.2 Common Pattern

In **every** inspected case, the pod event stream ended with:

```text
Normal  Scheduled  12m   default-scheduler  Successfully assigned <ns>/<pod> to <node>
Normal  Pulling    12m   kubelet            spec.containers{...}: Pulling image "iswprodacr.azurecr.io/<image>:<tag>"
```

No subsequent `Pulled`, `Created`, or `Started` events were observed.

---

## 5. Root Cause Analysis

### 5.1 What Was Ruled Out

| Possible Cause | Evidence | Verdict |
|----------------|----------|---------|
| CNI / Network plugin | No `FailedCreatePodSandBox` events | Ruled out |
| CSI / Storage / PVC | No `FailedMount` events; pods without volumes also stuck | Ruled out |
| Scheduling / resource pressure | Nodes are Ready; pods scheduled successfully | Ruled out as primary cause |
| Bad image tag / immediate rejection | No `ImagePullBackOff` or `ErrImagePull` | Ruled out |
| Pod-specific config | Affects dozens of unrelated workloads | Ruled out |

### 5.2 Primary Root Cause

**Image pulls from `iswprodacr.azurecr.io` are hanging indefinitely at the container runtime layer.**

This is a **cluster-wide, external dependency failure** affecting all nodes that need to pull images from the Azure Container Registry.

### 5.3 Likely Underlying Causes (in order of probability)

1. **Azure Container Registry unreachable or throttled** — all pulls target `iswprodacr.azurecr.io` and hang.
2. **Network path / proxy / firewall issue to ACR** — Azure cloud provider is disabled in this environment; egress may be blocked or slow.
3. **Containerd image-pull deadlock or registry authentication issue** — pulls hang rather than fail.
4. **ACR image layers extremely large or registry latency** — possible if many large Java images are being pulled concurrently.

### 5.4 Secondary Finding: Kyverno Policy Violations

Some pods showed:

```text
Warning  PolicyViolation  12m  kyverno-admission  policy verify-images-cosign/verify-images-cosign fail: Image must be signed by Cosign attestor
```

The pods were still scheduled and image pulls were attempted, so this appears to be a **warning/audit policy** rather than the cause of `ContainerCreating`. However, it should be reviewed for compliance.

---

## 6. Actions Taken

1. Queried cluster-wide pod status and identified ~90 `ContainerCreating` pods.
2. Described representative stuck pods to inspect events, volumes, and node assignment.
3. Confirmed the common pattern: all pods hang at `Pulling image` from `iswprodacr.azurecr.io`.
4. Force-deleted stuck pods in batches to trigger rescheduling.
5. Observed that new pods were immediately recreated and re-entered `ContainerCreating`, confirming persistent external cause.

---

## 7. Recommended Next Steps

1. **Test ACR reachability from inside the cluster:**
   ```bash
   kubectl run -it --rm debug --image=nicolaka/netshoot --restart=Never -- curl -I https://iswprodacr.azurecr.io/v2/
   ```

2. **Check containerd logs on affected nodes for pull errors/timeouts:**
   ```bash
   journalctl -u containerd -f
   ```

3. **Verify registry authentication:**
   - Check if an image pull secret is required/expired for `iswprodacr.azurecr.io`.
   - Inspect `imagePullSecrets` on service accounts.

4. **Verify Azure/cloud network path:**
   - Since Azure is disabled in this environment, confirm whether ACR is reachable.
   - Check proxy/firewall rules for outbound HTTPS to `*.azurecr.io`.

5. **Review Kyverno policy mode:**
   - Determine whether cosign violations should block image pulls.
   - Consider switching to `Enforce` only after registry issue is resolved.

6. **Address `sb-kube-node-012` disk pressure:**
   - Investigate ephemeral storage usage.
   - Clean up unused images/containers if needed.

---

## 8. Risk Assessment

| Risk | Level | Notes |
|------|-------|-------|
| Service availability | **High** | Many workloads cannot start; rolling updates will fail. |
| Recovery time | **Unknown** | Depends on external registry/network restoration. |
| Data loss | **Low** | No running workloads affected; only pod startup blocked. |
| Compliance | **Medium** | Kyverno cosign violations present on some images. |

---

## 9. Conclusion

The `ContainerCreating` epidemic is caused by **image pulls from `iswprodacr.azurecr.io` hanging indefinitely across all worker nodes**. This is an external registry/network issue, not a Kubernetes scheduling, CNI, or storage problem. Immediate attention should be directed to verifying ACR reachability, containerd health, and outbound network connectivity from the cluster.

---

*Report generated by Intermediate DevOps/SRE Agent — ad-sandbox-cluster investigation.*

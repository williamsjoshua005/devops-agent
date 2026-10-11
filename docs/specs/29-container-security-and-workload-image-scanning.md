# Feature Spec 29: Container Security & Workload Image Vulnerability Scanning

## 1. Overview & Objective
Deploying container images with known CVE vulnerabilities or unpinned tags into production environments exposes clusters to remote code execution (RCE), container breakout, and denial of service. The **Container Security & Workload Image Vulnerability Scanner** provides native automated scanning of container images and live Kubernetes workloads.

It features **dual operational modes**:
1. **Direct Image Scanning:** Audits container image registries and references (e.g. `nginx:latest`, `ghcr.io/org/api:v1.2.3`).
2. **Live Workload Image Resolution:** Natively inspects running Kubernetes **Pods**, **Deployments**, **StatefulSets**, and **DaemonSets**, automatically extracting all application and sidecar images to perform comprehensive multi-container vulnerability auditing.

---

## 2. Multi-Engine Adaptive Architecture

The engine uses a 3-tier fallback scanner pipeline to guarantee continuous operation across any host environment:

```mermaid
flowchart TD
    Request["Scan Request: container_image_scan(target)"] --> CheckWorkload{Is Target a K8s Workload?<br/>(pod/..., deployment/..., podName, deployName)}
    
    CheckWorkload -- Yes --> ResolveK8s["Query K8s Cluster via K8sTool.getWorkloadImages<br/>(Extracts spec.template.spec.containers[*].image)"]
    CheckWorkload -- No --> DirectImage["Use Target as Direct Image Reference"]
    
    ResolveK8s --> IterateContainers["Iterate Over Discovered Container Images"]
    DirectImage --> EnginePipeline
    IterateContainers --> EnginePipeline{"Scanner Availability"}

    EnginePipeline -- Trivy Available --> Trivy["Aqua Security Trivy<br/>(trivy image --format json --severity HIGH,CRITICAL)"]
    EnginePipeline -- Grype Available --> Grype["Anchore Grype<br/>(grype <image> -o json)"]
    EnginePipeline -- No Binaries Installed --> Heuristics["Built-In Heuristic & Metadata Engine<br/>(Zero External Dependencies)"]

    Trivy --> Aggregator["Vulnerability Aggregator & Report Formatter"]
    Grype --> Aggregator
    Heuristics --> Aggregator
    Aggregator --> Output["Markdown SRE Table / JSON Output"]
```

### 1. Aqua Security Trivy (Preferred)
- Executes:
  ```bash
  trivy image --severity <SEVERITIES> --format json --quiet <image>
  ```
- Parses structured JSON to extract CVE IDs (`VulnerabilityID`), affected packages (`PkgName`), installed vs. fixed versions (`InstalledVersion`, `FixedVersion`), and severity ratings.

### 2. Anchore Grype (Secondary)
- Executes:
  ```bash
  grype <image> -o json
  ```
- Extracts artifact matches, vulnerability descriptions, and remediation versions.

### 3. Built-In Heuristic & Metadata Engine (Zero-Dependency Fallback)
If neither Trivy nor Grype is installed on the host:
- **Tag Anti-Pattern Analysis:** Flags unpinned or mutable `:latest` tags (`TAG-ANTI-PATTERN-001`, High Risk) and recommends pinning to immutable semantic versions or `@sha256:` cryptographic digests.
- **End-of-Life (EOL) Runtime Detection:** Flags deprecated base runtimes (e.g. `node:14`, `node:16`, `python:2.7`, `python:3.7`, `alpine:3.12-3.13`, `ubuntu:18.04`, `centos:7`) known to contain unpatched OS, glibc, and OpenSSL CVEs (`CVE-DEPRECATED-BASE`, Critical Risk).
- **Hardening Recommendations:** Proposes distroless/scratch base images, non-root user execution (`USER 10001:10001`), and read-only root filesystems.

---

## 3. Workload Image Resolution (Pods & Deployments)

Operators can scan live cluster workloads directly without manually looking up image tags:

### Supported Target Identifiers
| Workload Kind | Syntax Formats | Example |
| :--- | :--- | :--- |
| **Deployment** | `deployment/<name>`, `deploy/<name>`, `deploymentName: "..."` | `/scan deployment/payment-api -n prod` |
| **Pod** | `pod/<name>`, `po/<name>`, `podName: "..."` | `/scan pod/checkout-worker-7b98d` |
| **StatefulSet** | `statefulset/<name>`, `sts/<name>` | `/scan sts/redis-cluster` |
| **DaemonSet** | `daemonset/<name>`, `ds/<name>` | `/scan ds/fluentbit` |
| **Direct Image** | Standard image reference | `/scan nginx:latest` |

### Multi-Container Workload Auditing
When targeting a workload with multiple containers (e.g. application container + Envoy/Istio sidecar or logging agent):
1. Discovers all containers via [`K8sTool.getWorkloadImages`](file:///Users/joshuawilliams/Documents/Research/devops-agent/src/tools/k8s.ts).
2. De-duplicates and scans each container image individually.
3. Produces an aggregated SRE report with container attribution.

---

## 4. Usage Patterns & Interfaces

### 1. Interactive REPL Slash Command
```bash
# Scan a live Deployment in production namespace
devops-agent> /scan deployment/payment-api -n prod

# Scan a live Pod in default namespace
devops-agent> /scan pod/api-worker-89fa2

# Scan a direct image tag
devops-agent> /scan redis:6.0
```

### 2. Autonomous Agent Tool (`container_image_scan`)
```json
{
  "name": "container_image_scan",
  "arguments": {
    "deploymentName": "payment-api",
    "namespace": "production",
    "severityThreshold": "HIGH",
    "format": "summary"
  }
}
```

---

## 5. Verification & Tests
Verified in [`test/smoke.test.ts`](file:///Users/joshuawilliams/Documents/Research/devops-agent/test/smoke.test.ts):
- **Test 63:** Validates autonomous READ evaluation, Trivy/Grype/heuristic scanning, JSON format, and deployment/pod workload targeting.

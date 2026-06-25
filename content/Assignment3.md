---
title: "Assignment 3"
slug: assignment3
date: 2025-04-01
math: true
---

# Assignment 3
# Ollama Installation on Hermes/pro: Installation Process and Issue Resolution Summary

## 1. Background and Goal

The goal of this setup was to install **Ollama on the pro machine where Hermes runs**, then run a local model that could later be used as a local model backend or fallback model for Hermes.

Environment naming convention used in this project:

```text
mac = local computer, terminal prompt similar to: (base) liziqi@Mac ~ %
pro = remote Hermes machine, terminal prompt similar to: lhx@wuwenjundeMBP ~ %
```

The originally intended architecture was:

```text
WeChat / Feishu / Hermes
    ↓
Hermes
    ↓
Local Ollama service
    ↓
qwen3-4b-local local model
```

Actual final status at the end of this setup:

```text
pro
├── Ollama: installed successfully
├── local model qwen3-4b-local: imported and runnable
└── Hermes: not yet connected to Ollama
```

---

## 2. Initial Environment Check

Commands executed on pro:

```bash
sw_vers
uname -m
df -h ~
command -v ollama || true
```

Output showed:

```text
ProductName: macOS
ProductVersion: 13.4.1
BuildVersion: 22F82
x86_64
Available disk space: about 198Gi
```

Conclusion:

```text
pro was an Intel MacBook Pro running macOS 13.4.1. Disk space was sufficient, but the macOS version was too old.
```

The current macOS version of Ollama requires **macOS 14 Sonoma or newer**, so the latest Ollama could not be installed directly on macOS 13.4.1.

---

## 3. Checking Whether pro Supports a macOS Upgrade

Commands executed:

```bash
system_profiler SPHardwareDataType | egrep "Model Name|Model Identifier|Processor Name|Processor Speed|Total Number of Cores|Memory"
softwareupdate --list-full-installers
```

Hardware information:

```text
Model Name: MacBook Pro
Model Identifier: MacBookPro15,1
Processor Name: 6-Core Intel Core i7
Processor Speed: 2.2 GHz
Total Number of Cores: 6
Memory: 16 GB
```

Available installers included:

```text
macOS Sonoma 14.8.7
macOS Sequoia 15.7.7
```

Conclusion:

```text
This pro machine supports upgrading to macOS Sonoma / Sequoia.
For Hermes stability, Sonoma was preferred over upgrading directly to Sequoia.
```

---

## 4. Downloading and Installing macOS Sonoma

Initial command suggested:

```bash
softwareupdate --fetch-full-installer --full-installer-version 14.8.7
```

Installer check:

```bash
ls -lah /Applications | grep "Install macOS Sonoma"
```

The installer existed:

```text
Install macOS Sonoma.app
```

Then the upgrade was attempted using the `lhx` account:

```bash
sudo "/Applications/Install macOS Sonoma.app/Contents/Resources/startosinstall" --agreetolicense
```

Issue encountered:

```text
lhx is not in the sudoers file. This incident will be reported.
```

Reason:

```text
The lhx account was not an administrator account and could not run sudo.
```

Resolution:

```text
Switched to the administrator account hififly and performed the system upgrade from there.
```

---

## 5. macOS Upgrade Error Encountered

While running the upgrade from the administrator account, this error occurred:

```text
The operation couldn’t be completed. (PKDownloadError error 8.)
```

Diagnosis:

```text
This was not a permission issue. It was likely related to installer preparation, download validation, or network verification.
```

Installer size was checked:

```bash
du -sh "/Applications/Install macOS Sonoma.app"
```

Result:

```text
13G /Applications/Install macOS Sonoma.app
```

This suggested that the installer was mostly complete.

An attempt was made to delete the installer and update cache:

```bash
sudo rm -rf "/Applications/Install macOS Sonoma.app"
sudo rm -rf /Library/Updates/*
```

Deleting `/Library/Updates/*` returned:

```text
Operation not permitted
```

Conclusion:

```text
This was caused by macOS system protection and was not the core issue.
The important file to re-download was /Applications/Install macOS Sonoma.app.
```

A later attempt to fetch 14.8.7 returned:

```text
Install failed with error: Update not found
```

Diagnosis:

```text
The softwareupdate catalog may have been inconsistent or temporarily unable to fetch that exact full installer version.
The goal was only to upgrade to macOS 14+, so it was unnecessary to insist on one specific patch version.
```

Eventually the system upgrade completed and the machine rebooted automatically.

After reboot, the system version was checked:

```bash
sw_vers
uname -m
```

Output:

```text
ProductName: macOS
ProductVersion: 14.8.7
BuildVersion: 23J520
x86_64
```

Conclusion:

```text
pro was successfully upgraded to macOS Sonoma 14.8.7, satisfying Ollama’s macOS requirement.
```

---

## 6. Installing Ollama

After the system upgrade, Ollama was installed successfully. Then the `lhx` account was used to verify access:

```bash
ollama --version
curl http://127.0.0.1:11434
```

Output:

```text
ollama version is 0.24.0
Ollama is running
```

Conclusion:

```text
Ollama was installed successfully, and the lhx account could access the local Ollama service.
```

Important note:

```text
The Ollama service on port 11434 was started in the background by hififly, not by lhx.
```

Process check:

```bash
ps aux | egrep '[o]llama|[O]llama'
lsof -nP -iTCP:11434 -sTCP:LISTEN
```

Observed processes:

```text
hififly started /Applications/Ollama.app/Contents/Resources/ollama serve
hififly started /Applications/Ollama.app/Contents/MacOS/Ollama hidden
```

---

## 7. Failed Attempt to Pull the Official qwen3:4b Model

Initial attempt:

```bash
ollama run qwen3:4b
```

Error:

```text
Error: pull model manifest: Get "https://registry.ollama.ai/v2/library/qwen3/manifests/4b": tls: failed to verify certificate: x509: “ollama.ai” certificate is not standards compliant
```

Diagnosis:

```text
The model did exist. The problem was a TLS certificate verification failure during Ollama’s model pull process.
```

---

## 8. Certificate Issue Investigation

Commands executed on pro / lhx:

```bash
date
scutil --proxy
env | egrep -i 'http_proxy|https_proxy|all_proxy|no_proxy|ssl|cert|ollama'
```

Findings:

```text
System proxy was not enabled.
No obvious proxy-related environment variables were found.
System time was normal.
```

Registry certificate check:

```bash
curl -Iv https://registry.ollama.ai/v2/ 2>&1 | egrep -i 'subject|issuer|SSL|certificate|HTTP'
```

Result:

```text
subject: CN=ollama.ai
subjectAltName: host "registry.ollama.ai" matched cert's "*.ollama.ai"
issuer: Google Trust Services
SSL certificate verify ok.
HTTP/2 404
```

Diagnosis:

```text
curl could verify the HTTPS certificate for registry.ollama.ai successfully.
Therefore, the system network itself was not broken. The problem was specific to Ollama’s own Go TLS verification path.
```

DNS check:

```bash
dig registry.ollama.ai
```

Returned Cloudflare IPs:

```text
104.21.75.227
172.67.182.229
```

Conclusion:

```text
DNS resolution was normal.
```

---

## 9. Starting an Ollama Service Manually Under lhx

To rule out environment issues from the hififly background service, a separate Ollama service was started under the `lhx` account:

```bash
mkdir -p ~/.ollama/logs
SSL_CERT_FILE=/etc/ssl/cert.pem OLLAMA_HOST=127.0.0.1:11435 ollama serve
```

A second terminal tested model pulling through port 11435:

```bash
OLLAMA_HOST=http://127.0.0.1:11435 ollama pull qwen3:4b
```

Result:

```text
tls: failed to verify certificate: x509: “ollama.ai” certificate is not standards compliant
```

Conclusion:

```text
The issue was not caused by the hififly background service.
Even the lhx-owned Ollama service on port 11435 had the same TLS verification failure.
```

---

## 10. Failed Attempt with --insecure

Checked whether `ollama pull` supports `--insecure`:

```bash
ollama pull --help | grep -i insecure
```

Output:

```text
--insecure   Use an insecure registry
```

Attempt:

```bash
OLLAMA_HOST=http://127.0.0.1:11435 ollama pull --insecure qwen3:4b
```

Result:

```text
Get "http://registry.ollama.ai/v2/library/qwen3/manifests/4b": read tcp ...:80: read: operation timed out
```

Diagnosis:

```text
--insecure changed the request to HTTP instead of solving the HTTPS certificate-chain problem.
Therefore, --insecure was not a suitable solution.
```

---

## 11. Failed Attempt to Let Ollama Pull Directly from Hugging Face

Attempt:

```bash
OLLAMA_HOST=http://127.0.0.1:11435 ollama run hf.co/bartowski/Qwen_Qwen3-4B-GGUF:Q4_K_M
```

Result:

```text
tls: failed to verify certificate: x509: “hf.co” certificate is not standards compliant
```

Conclusion:

```text
The TLS problem was not limited to registry.ollama.ai. Ollama also failed when pulling from hf.co.
Any model download initiated by Ollama itself would hit the same certificate problem.
```

---

## 12. Final Solution: Manual GGUF Download and Local Import

Since `curl` could verify HTTPS correctly, but Ollama’s own model download failed, the final solution was:

```text
Download the GGUF model on mac → transfer it to pro with rsync → import it locally into Ollama using a Modelfile
```

### 12.1 Direct Hugging Face Download on pro Failed

Attempt on pro:

```bash
curl -L -C - --fail \
  --retry 999 \
  --retry-all-errors \
  --retry-delay 10 \
  --connect-timeout 30 \
  --speed-limit 1024 \
  --speed-time 60 \
  -o Qwen_Qwen3-4B-Q4_K_M.gguf \
  "https://huggingface.co/bartowski/Qwen_Qwen3-4B-GGUF/resolve/main/Qwen_Qwen3-4B-Q4_K_M.gguf"
```

Failure:

```text
Failed to connect to huggingface.co port 443
```

Diagnosis:

```text
pro’s network path to Hugging Face was unstable or unavailable.
```

### 12.2 Successful Download on mac via hf-mirror

Commands executed on mac:

```bash
mkdir -p ~/Downloads/qwen3-4b
cd ~/Downloads/qwen3-4b

curl -L -C - --fail \
  --retry 999 \
  --retry-delay 10 \
  -o Qwen_Qwen3-4B-Q4_K_M.gguf \
  "https://hf-mirror.com/bartowski/Qwen_Qwen3-4B-GGUF/resolve/main/Qwen_Qwen3-4B-Q4_K_M.gguf"
```

Download succeeded:

```text
100 2381M
```

This confirmed the model file size was about 2.3GB.

### 12.3 Transfer from mac to pro

Commands executed on mac:

```bash
ssh lhx@192.168.31.53 'mkdir -p /Users/lhx/models/qwen3-4b'

rsync -avP ~/Downloads/qwen3-4b/Qwen_Qwen3-4B-Q4_K_M.gguf \
  lhx@192.168.31.53:/Users/lhx/models/qwen3-4b/
```

After transfer, the file was checked on pro:

```bash
cd ~/models/qwen3-4b
ls -lh Qwen_Qwen3-4B-Q4_K_M.gguf
```

Output:

```text
-rw-r--r--  1 lhx  staff   2.3G  5 31 19:22 Qwen_Qwen3-4B-Q4_K_M.gguf
```

Conclusion:

```text
The model file was successfully transferred to pro.
```

---

## 13. Local Model Import into Ollama

Commands executed on pro / lhx:

```bash
cd ~/models/qwen3-4b

cat > Modelfile <<'MODELFILE_END'
FROM ./Qwen_Qwen3-4B-Q4_K_M.gguf
MODELFILE_END
```

Confirmed that the lhx-owned Ollama service on port 11435 was running:

```bash
curl http://127.0.0.1:11435
```

Expected result:

```text
Ollama is running
```

Imported the local model:

```bash
OLLAMA_HOST=http://127.0.0.1:11435 ollama create qwen3-4b-local -f Modelfile
```

Tested the model:

```bash
OLLAMA_HOST=http://127.0.0.1:11435 ollama run qwen3-4b-local
```

Test prompt:

```text
你好，用一句话介绍你自己。/no_think
```

The model returned a response successfully.

Conclusion:

```text
qwen3-4b-local was successfully imported into Ollama and can run locally on pro.
```

---

## 14. Current Final Status

Current state:

```text
pro / macOS 14.8.7 / Intel x86_64
├── Ollama 0.24.0: installed
├── hififly background Ollama: running on port 11434
├── lhx manual Ollama: running on port 11435
├── qwen3-4b-local: imported into the 11435 service and runnable
└── Hermes: not yet connected to Ollama
```

Not yet completed:

```text
1. Stop or clean up the hififly-owned Ollama service on port 11434
2. Decide whether Hermes should use port 11434 or 11435
3. Configure Ollama to run stably in the background
4. Modify Hermes configuration so Hermes can call qwen3-4b-local
```

---

## 15. Relationship Between Ollama and Hermes

Ollama is not Hermes, and it is not the model itself.

A useful mental model:

```text
GGUF model file = the brain itself
Ollama = model runner / model container / local model service
Hermes = message entrypoint, tool system, and bot framework
WeChat / Feishu = user interaction entrypoint
```

Before Hermes integration:

```text
User calls Ollama directly in terminal
    ↓
Ollama
    ↓
qwen3-4b-local
```

After Hermes integration:

```text
WeChat / Feishu
    ↓
Hermes
    ↓
Ollama local API
    ↓
qwen3-4b-local
```

Therefore, Ollama’s role is to provide Hermes with a local model backend.

---

## 16. Local Ollama vs DeepSeek API

### Advantages of Local Ollama

```text
1. Runs locally and does not rely on a remote API
2. No token-based billing for local inference
3. Better privacy because data does not need to be sent to a cloud API
4. Can be used as a fallback model when external APIs are unavailable
5. Suitable for simple classification, short summaries, log explanation, and lightweight tasks
```

### Disadvantages of Local Ollama in This Setup

```text
1. qwen3-4b-local is only a 4B model and is much weaker than DeepSeek API models
2. pro is an Intel i7 machine with 16GB memory and only CPU inference, so performance is limited
3. It is not suitable as the only model for complex reasoning, academic writing, long-document processing, or trading analysis
4. Local deployment requires maintaining system version, model files, ports, background services, and Hermes configuration
```

Conclusion:

```text
The current Ollama setup should not replace DeepSeek API.
A better role is: local fallback model, low-cost lightweight task model, and private-content processing model for Hermes.
```

Recommended future architecture:

```text
Complex tasks → DeepSeek API / stronger cloud model
Simple tasks → Ollama qwen3-4b-local
Private tasks → Ollama qwen3-4b-local
API unavailable → Ollama fallback
```

---

## 17. Follow-up Recommendations

### 17.1 Do Not Delete the GGUF File on pro Yet

Model source file location on pro:

```text
/Users/lhx/models/qwen3-4b/Qwen_Qwen3-4B-Q4_K_M.gguf
```

After importing into Ollama, the model should be managed by Ollama internally. However, keeping the original GGUF file is useful if the model needs to be rebuilt later.

The mac download file can be deleted after confirming the model has been imported and runs correctly:

```bash
rm -f ~/Downloads/qwen3-4b/Qwen_Qwen3-4B-Q4_K_M.gguf
rmdir ~/Downloads/qwen3-4b 2>/dev/null
```

### 17.2 Clean Up Ollama Background Services Later

Current services:

```text
11434: started by hififly
11435: manually started by lhx
```

Recommended final setup:

```text
Start Ollama under lhx and use a fixed port, either 11434 or 11435, as the Hermes backend.
```

Temporary background start example:

```bash
nohup env OLLAMA_HOST=127.0.0.1:11435 ollama serve > ~/.ollama/ollama-11435.log 2>&1 &
```

Check the service:

```bash
curl http://127.0.0.1:11435/api/tags
```

If `qwen3-4b-local` appears, the service is usable.

### 17.3 Hermes Integration Has Not Been Done Yet

Before integrating Hermes, locate Hermes’s model configuration file and set the local backend to something like:

```text
base_url = http://127.0.0.1:11435
model = qwen3-4b-local
```

Useful checks before continuing:

```bash
ps aux | grep -i "hermes" | grep -v grep
ls -lah ~/.hermes

grep -Rni "OLLAMA\|OPENAI\|MODEL\|LLM\|ANTHROPIC\|BASE_URL" ~/.hermes/.env ~/.hermes 2>/dev/null | head -n 100
```

---

## 18. Final Conclusion

This setup successfully completed the following:

```text
1. Upgraded pro from macOS 13.4.1 to macOS 14.8.7
2. Installed Ollama 0.24.0
3. Diagnosed why Ollama could not download models directly
4. Downloaded the GGUF model through hf-mirror on mac
5. Transferred the model to pro using rsync
6. Imported the model from a local GGUF file using a Modelfile
7. Successfully ran qwen3-4b-local locally on pro
```

Main problems and final resolutions:

```text
Problem 1: macOS version too old
Resolution: upgraded to macOS Sonoma 14.8.7

Problem 2: lhx was not an administrator and could not sudo the system upgrade
Resolution: used the hififly administrator account for the macOS upgrade

Problem 3: PKDownloadError error 8 during installer preparation
Resolution: handled installer issues and completed the upgrade without relying on deleting protected system caches

Problem 4: Ollama failed TLS certificate verification when pulling from the official registry
Resolution: stopped using Ollama’s online model pull and switched to manual GGUF download

Problem 5: pro timed out when directly downloading from Hugging Face
Resolution: downloaded via hf-mirror on mac, then transferred the file to pro with rsync

Problem 6: Ollama also failed TLS verification when pulling directly from hf.co
Resolution: completely bypassed Ollama’s online download and imported from a local GGUF file
```

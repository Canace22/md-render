#!/usr/bin/env bash
# 自动 bump 版本号、创建 annotated tag 并推送到 origin
# 用法:
#   bash scripts/release-tag.sh              # patch bump（若 package.json 未超前）并打 tag
#   bash scripts/release-tag.sh --minor      # minor bump
#   bash scripts/release-tag.sh --major      # major bump
#   bash scripts/release-tag.sh --no-bump    # 不 bump，使用 package.json 现有版本
#   bash scripts/release-tag.sh --commit     # bump 后自动提交 package.json
#   bash scripts/release-tag.sh --no-push    # 仅本地创建 tag
#   bash scripts/release-tag.sh --dry-run    # 预览，不写入
#   bash scripts/release-tag.sh --message "自定义说明"
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

PUSH=true
DRY_RUN=false
AUTO_BUMP=true
AUTO_COMMIT=false
BUMP_TYPE=""
CUSTOM_MESSAGE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --push) PUSH=true; shift ;;
    --no-push) PUSH=false; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    --no-bump) AUTO_BUMP=false; shift ;;
    --commit) AUTO_COMMIT=true; shift ;;
    --patch) BUMP_TYPE="patch"; shift ;;
    --minor) BUMP_TYPE="minor"; shift ;;
    --major) BUMP_TYPE="major"; shift ;;
    --message)
      CUSTOM_MESSAGE="${2:-}"
      if [[ -z "$CUSTOM_MESSAGE" ]]; then
        echo "错误: --message 需要非空内容" >&2
        exit 1
      fi
      shift 2
      ;;
    -h|--help)
      sed -n '2,12p' "$0" | sed 's/^# //'
      exit 0
      ;;
    *)
      echo "未知参数: $1（可用 --help 查看用法）" >&2
      exit 1
      ;;
  esac
done

RED='\033[0;31m'
YEL='\033[0;33m'
GRN='\033[0;32m'
NC='\033[0m'

info() { echo -e "${GRN}>>${NC} $1"; }
warn() { echo -e "${YEL}WARN${NC} $1"; }
fail() { echo -e "${RED}FAIL${NC} $1" >&2; exit 1; }

PKG_ROOT="$ROOT/package.json"
PKG_EDITOR="$ROOT/apps/editor/package.json"
VERSION_FILES=( "$PKG_ROOT" "$PKG_EDITOR" )

read_pkg_version() {
  node -p "require(process.argv[1]).version" "$1"
}

resolve_next_version() {
  node - "$1" "$2" "$3" "$4" <<'NODE'
const [autoBump, bumpType, prevVersion, pkgVersion] = process.argv.slice(2);

function bump(version, type) {
  const parts = version.split('.').map((part) => Number(part));
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    throw new Error(`无效 semver: ${version}`);
  }
  const [major, minor, patch] = parts;
  if (type === 'major') return `${major + 1}.0.0`;
  if (type === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function compare(a, b) {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    if (left[i] > right[i]) return 1;
    if (left[i] < right[i]) return -1;
  }
  return 0;
}

function maxSemver(a, b) {
  if (!a) return b;
  if (!b) return a;
  return compare(a, b) >= 0 ? a : b;
}

if (autoBump !== 'true') {
  process.stdout.write(pkgVersion);
  process.exit(0);
}

const baseVersion = prevVersion || pkgVersion;
const explicitBump = bumpType.length > 0;

if (!explicitBump && compare(pkgVersion, baseVersion) > 0) {
  process.stdout.write(pkgVersion);
  process.exit(0);
}

const bumpBase = explicitBump ? maxSemver(prevVersion, pkgVersion) : baseVersion;
const type = bumpType || 'patch';
process.stdout.write(bump(bumpBase, type));
NODE
}

write_pkg_versions() {
  node - "$1" "${VERSION_FILES[@]}" <<'NODE'
const fs = require('node:fs');
const version = process.argv[2];
const files = process.argv.slice(3);

for (const file of files) {
  const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
  pkg.version = version;
  fs.writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
}
NODE
}

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  fail "当前目录不是 git 仓库"
fi

if [[ ! -f "$PKG_ROOT" ]]; then
  fail "未找到根目录 package.json"
fi

for pkg_file in "${VERSION_FILES[@]}"; do
  if [[ ! -f "$pkg_file" ]]; then
    fail "未找到版本文件: ${pkg_file#"$ROOT"/}"
  fi
done

PKG_VERSION="$(read_pkg_version "$PKG_ROOT")"
if [[ -z "$PKG_VERSION" ]]; then
  fail "无法从 package.json 读取 version"
fi

PREV_TAG="$(git tag -l 'v*' --sort=-v:refname | head -1 || true)"
PREV_VERSION=""
if [[ -n "$PREV_TAG" ]]; then
  PREV_VERSION="${PREV_TAG#v}"
fi

VERSION="$(resolve_next_version "$AUTO_BUMP" "$BUMP_TYPE" "$PREV_VERSION" "$PKG_VERSION")"
TAG="v${VERSION}"
BUMPED=false

if [[ "$VERSION" != "$PKG_VERSION" ]]; then
  BUMPED=true
  if [[ "$DRY_RUN" == true ]]; then
    info "将 bump 版本: ${PKG_VERSION} → ${VERSION}"
    for pkg_file in "${VERSION_FILES[@]}"; do
      info "  - ${pkg_file#"$ROOT"/}"
    done
  else
    write_pkg_versions "$VERSION"
    info "已 bump 版本: ${PKG_VERSION} → ${VERSION}"
    for pkg_file in "${VERSION_FILES[@]}"; do
      info "  - ${pkg_file#"$ROOT"/}"
    done
  fi
fi

if [[ -n "$PREV_VERSION" ]]; then
  HIGHER="$(printf '%s\n' "$VERSION" "$PREV_VERSION" | sort -V | tail -1)"
  if [[ "$HIGHER" == "$PREV_VERSION" ]]; then
    if [[ "$VERSION" == "$PREV_VERSION" ]]; then
      fail "版本 ${VERSION} 与最新 tag ${PREV_TAG} 相同，请使用 --patch / --minor / --major 或 --no-bump 前先手动 bump"
    else
      fail "版本 ${VERSION} 低于最新 tag ${PREV_TAG}"
    fi
  fi
fi

if git rev-parse "$TAG" >/dev/null 2>&1; then
  fail "本地已存在 tag: $TAG"
fi

if git ls-remote --tags origin "refs/tags/${TAG}" 2>/dev/null | grep -q .; then
  fail "远程 origin 已存在 tag: $TAG"
fi

if [[ "$BUMPED" == true && "$DRY_RUN" != true ]]; then
  if [[ "$AUTO_COMMIT" == true ]]; then
    git add "${VERSION_FILES[@]}"
    git commit -m "chore: bump version to ${VERSION}"
    info "已提交版本 bump"
  elif [[ -n "$(git status --porcelain -- "${VERSION_FILES[@]}")" ]]; then
    fail "版本已写入 package.json，请先提交或使用 --commit 自动提交"
  fi
fi

if [[ -n "$(git status --porcelain)" ]]; then
  warn "工作区有未提交改动，tag 将指向当前 HEAD"
fi

COMMIT="$(git rev-parse --short HEAD)"

if [[ -n "$CUSTOM_MESSAGE" ]]; then
  TAG_MESSAGE="$CUSTOM_MESSAGE"
else
  TAG_MESSAGE="${TAG}"
  if [[ -n "$PREV_TAG" ]]; then
    LOG="$(git log "${PREV_TAG}..HEAD" --pretty=format:'- %s' --no-merges 2>/dev/null || true)"
    if [[ -n "$LOG" ]]; then
      TAG_MESSAGE="${TAG}

${LOG}"
    fi
  fi
fi

echo
info "版本: ${VERSION}"
info "Tag:  ${TAG}"
info "提交: ${COMMIT}"
if [[ -n "$PREV_TAG" ]]; then
  info "上个 tag: ${PREV_TAG}"
else
  info "上个 tag: （无）"
fi
if [[ "$AUTO_BUMP" == true ]]; then
  if [[ -n "$BUMP_TYPE" ]]; then
    info "Bump: ${BUMP_TYPE}"
  elif [[ "$BUMPED" == true ]]; then
    info "Bump: patch（自动）"
  else
    info "Bump: 跳过（package.json 已超前）"
  fi
else
  info "Bump: 关闭（--no-bump）"
fi
echo
echo "Tag 说明:"
echo "$TAG_MESSAGE"
echo

if [[ "$DRY_RUN" == true ]]; then
  info "dry-run 模式，未写入版本号或创建 tag"
  exit 0
fi

git tag -a "$TAG" -m "$TAG_MESSAGE"
info "已创建 annotated tag: $TAG"

if [[ "$PUSH" == true ]]; then
  git push origin "$TAG"
  info "已推送到 origin: $TAG"
else
  warn "跳过推送。如需推送: git push origin $TAG"
fi

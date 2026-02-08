#!/bin/bash
# Remotion 项目创建脚本

PROJECT_NAME=${1:-my-video-project}

echo "Creating Remotion project: $PROJECT_NAME"

# 检查是否安装了 create-remotion
if command -v npx &> /dev/null; then
  npx create-remotion@latest "$PROJECT_NAME" --template=blank
  echo "Project created! Run these commands:"
  echo "  cd $PROJECT_NAME"
  echo "  npm install"
  echo "  npm run dev"
else
  echo "Error: npx not found. Please install Node.js first."
  exit 1
fi

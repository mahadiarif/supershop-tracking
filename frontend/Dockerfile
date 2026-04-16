FROM node:20-alpine AS build

WORKDIR /app

ARG VITE_API_BASE_URL=http://127.0.0.1:8001/api
ARG VITE_WS_URL=ws://127.0.0.1:8001/ws/dashboard
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_WS_URL=$VITE_WS_URL

COPY frontend/package*.json ./
RUN npm install

COPY frontend/ ./
RUN npm run build

FROM nginx:alpine

COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

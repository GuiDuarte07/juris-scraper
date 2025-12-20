FROM node:20-alpine

WORKDIR /usr/src/app

# Copia apenas manifests para cache de dependências
COPY package.json package-lock.json ./

# Instala dependências
RUN npm install --no-audit --no-fund

# Copia o restante do código (sem node_modules via .dockerignore)
COPY . .

# Build da aplicação
RUN npm run build

EXPOSE 4214

CMD ["npm", "run", "start:prod"]

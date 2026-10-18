FROM node:20-bookworm-slim

ENV PYTHONUNBUFFERED=1

# Python is required by the football analytics service. The slim Debian image
# provides compatible wheels for NumPy/scikit-learn without Alpine build issues.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install analytics dependencies separately so Docker can cache this layer.
COPY football-analytics/requirements.txt /tmp/football-requirements.txt
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r /tmp/football-requirements.txt

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

# Prepare the five committed EPL seasons and train real-data baseline artifacts
# during image build. The service will fail clearly rather than silently use
# synthetic examples if this step cannot complete.
RUN cd football-analytics \
    && python prepare_epl_data.py \
    && python train.py --data data/epl_historical.csv --models-dir models

EXPOSE 3000

CMD ["npm", "run", "start"]

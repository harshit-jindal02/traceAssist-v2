# Use a slim Python base image
FROM python:3.10-slim

# Set the working directory
WORKDIR /app

# Install Python dependencies
# Copy only the requirements file first to leverage Docker's layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the backend application code
COPY . .

# Command to run the FastAPI application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

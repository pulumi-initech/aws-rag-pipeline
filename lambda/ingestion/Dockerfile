FROM public.ecr.aws/lambda/python:3.11

# Copy requirements and install dependencies
COPY requirements.txt ${LAMBDA_TASK_ROOT}

RUN pip install --upgrade pip && \
    pip install --only-binary=:all: -r requirements.txt --target "${LAMBDA_TASK_ROOT}"

# Copy function code
COPY main.py ${LAMBDA_TASK_ROOT}

# Set the CMD to your handler
CMD [ "main.lambda_handler" ]
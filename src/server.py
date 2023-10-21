#!/usr/bin/env python

from http.server import BaseHTTPRequestHandler, HTTPServer
from socketserver import ThreadingMixIn
import threading

from urllib.parse import urlparse
from urllib.parse import parse_qs
from urllib.parse import parse_qsl
import urllib.request
import cgi
import uuid
import random
import string
from cgi import parse_header, parse_multipart
import argparse
import uuid
import random
import time
import json
import shutil
import ssl
import glob
import os
import base64
import mimetypes
import pathlib

from file_writer import FileWriter
from mbtiles_writer import MbtilesWriter
from repo_writer import RepoWriter
from utils import Utils

lock = threading.Lock()


class serverHandler(BaseHTTPRequestHandler):

    def randomString(self):
        return uuid.uuid4().hex.upper()[0:6]

    def writerByType(self, type):
        if (type == "mbtiles"):
            return MbtilesWriter
        elif (type == "repo"):
            return RepoWriter
        elif (type == "directory"):
            return FileWriter

    def do_POST(self):

        ctype, pdict = cgi.parse_header(self.headers.get('Content-Type'))
        # ctype, pdict = cgi.parse_header(self.headers['content-type'])
        pdict['boundary'] = bytes(pdict['boundary'], "utf-8")

        content_len = int(self.headers.get('Content-length'))
        pdict['CONTENT-LENGTH'] = content_len

        postvars = cgi.parse_multipart(self.rfile, pdict)

        parts = urlparse(self.path)
        if parts.path == '/download-tile':

            x = int(postvars['x'][0])
            y = int(postvars['y'][0])
            z = int(postvars['z'][0])
            quad = str(postvars['quad'][0])
            timestamp = int(postvars['timestamp'][0])
            outputDirectory = str(postvars['outputDirectory'][0])
            outputFile = str(postvars['outputFile'][0])
            outputType = str(postvars['outputType'][0])
            outputScale = int(postvars['outputScale'][0])
            source = str(postvars['source'][0])

            replaceMap = {
                "x": str(x),
                "y": str(y),
                "z": str(z),
                "quad": quad,
                "timestamp": str(timestamp),
            }

            for key, value in replaceMap.items():
                newKey = str("{" + str(key) + "}")
                outputDirectory = outputDirectory.replace(newKey, value)
                outputFile = outputFile.replace(newKey, value)

            result = {}

            filePath = os.path.join("output", outputDirectory, outputFile)

            print("\n")

            if self.writerByType(outputType).exists(filePath, x, y, z):
                result["code"] = 200
                result["message"] = 'Tile already exists'

                print("EXISTS: " + filePath)

            else:

                tempFile = self.randomString() + ".png"
                tempFilePath = os.path.join("temp", tempFile)

                result["code"] = Utils.downloadFileScaled(
                    source, tempFilePath, x, y, z, outputScale)

                print("HIT: " + source + "\n" +
                      "RETURN: " + str(result["code"]))

                if os.path.isfile(tempFilePath):
                    self.writerByType(outputType).addTile(
                        lock, filePath, tempFilePath, x, y, z, outputScale)

                    with open(tempFilePath, "rb") as image_file:
                        result["image"] = base64.b64encode(
                            image_file.read()).decode("utf-8")

                    os.remove(tempFilePath)

                    result["message"] = 'Tile Downloaded'
                    print("SAVE: " + filePath)

                else:
                    result["message"] = 'Download failed'

            self.send_response(200)
            # self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(result).encode('utf-8'))
            return
        # Validates eachfile # check = os.path.isdir(filePath)
        elif parts.path == "/validate":
            # print("postvars in valid")
            # print(postvars)
            # outputDirectory = str(postvars['outputDirectory'][0])
            # outputFile = str(postvars['outputFile'][0])
            # minZoom = int(postvars['minZoom'][0])
            # maxZoom = int(postvars['maxZoom'][0])
            values = range(3, 15)
            result = {}
            result["missFiles"] = []
            result["code"] = 200
            result["message"] = 'file is valid'
            for i in values:
                filePath = os.path.join("output")
                check = os.path.isdir(filePath)
                print("the file path is")
                print(outputFile)
                print(filePath)
                if check == False:
                    result["missTiles"].append(i)
                    result["code"] = 404
                    result["message"] = 'file is missing'
            self.send_response(200)
            # self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(result).encode('utf-8'))
            return
        #### Start writing the metadata.json####
        elif parts.path == '/start-download':
            outputType = str(postvars['outputType'][0])
            outputScale = int(postvars['outputScale'][0])
            outputDirectory = str(postvars['outputDirectory'][0])
            outputFile = str(postvars['outputFile'][0])
            minZoom = int(postvars['minZoom'][0])
            maxZoom = int(postvars['maxZoom'][0])
            timestamp = int(postvars['timestamp'][0])
            bounds = str(postvars['bounds'][0])
            boundsArray = map(float, bounds.split(","))
            center = str(postvars['center'][0])
            centerArray = map(float, center.split(","))

            replaceMap = {
                "timestamp": str(timestamp),
            }

            for key, value in replaceMap.items():
                newKey = str("{" + str(key) + "}")
                outputDirectory = outputDirectory.replace(newKey, value)
                outputFile = outputFile.replace(newKey, value)

            filePath = os.path.join("output", outputDirectory, outputFile)

            self.writerByType(outputType).addMetadata(lock, os.path.join("output", outputDirectory), filePath, outputFile,
                                                      "Map Tiles Downloader via AliFlux", "png", boundsArray, centerArray, minZoom, maxZoom, "mercator", 256 * outputScale)

            result = {}
            result["code"] = 200
            result["message"] = 'Metadata written'

            self.send_response(200)
            # self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(result).encode('utf-8'))
            return

        # Closes the  the last json file

        elif parts.path == '/end-download':
            outputType = str(postvars['outputType'][0])
            outputScale = int(postvars['outputScale'][0])
            outputDirectory = str(postvars['outputDirectory'][0])
            outputFile = str(postvars['outputFile'][0])
            minZoom = int(postvars['minZoom'][0])
            maxZoom = int(postvars['maxZoom'][0])
            timestamp = int(postvars['timestamp'][0])
            bounds = str(postvars['bounds'][0])
            boundsArray = map(float, bounds.split(","))
            center = str(postvars['center'][0])
            centerArray = map(float, center.split(","))
            logger = str(postvars['log'][0])

            replaceMap = {
                "timestamp": str(timestamp),
            }

            for key, value in replaceMap.items():
                newKey = str("{" + str(key) + "}")
                outputDirectory = outputDirectory.replace(newKey, value)
                outputFile = outputFile.replace(newKey, value)

            filePath = os.path.join("output", outputDirectory, outputFile)

            self.writerByType(outputType).close(lock, os.path.join(
                "output", outputDirectory), filePath, minZoom, maxZoom)

            textPath = os.path.join("output", outputDirectory, "log.txt")
            t = open(textPath, "a")
            t.write(logger)
            t.close()
            print("the log isss "+logger)

            result = {}
            result["code"] = 200
            result["message"] = 'Downloaded ended'

            self.send_response(200)
            # self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(result).encode('utf-8'))
            return

    def do_GET(self):

        parts = urlparse(self.path)
        path = parts.path.strip('/')
        if path == "":
            path = "index.htm"
        if parts.path == "/validate":

            query_string = parts.query.replace('%22', '"')
            storQue = json.loads(query_string)

            minzoom = storQue["minzoom"]
            maxzoom = storQue["maxzoom"]
            # outputDirectory = storQue["outputDirectory"]
            timestamp = storQue["timestamp"]
            total = storQue["total"]
            values = range(minzoom, maxzoom)
            result = {}
            result["missFiles"] = []
            result["code"] = 200
            result["message"] = 'file is valid'
            # check if directory exists
            for i in values:
                filePath = os.path.join("output", timestamp, str(i))
                check = os.path.isdir(filePath)
                print("the file path is")
                print(filePath)
                if check == False:
                    result["missFiles"].append(i)
                    result["code"] = 404
                    result["message"] = 'file is missing at path ' + filePath

            # check by last directory
            lastFolder = max(pathlib.Path("output").glob(
                '*/'), key=os.path.getmtime)

            count = 0
            for root_dir, cur_dir, files in os.walk(lastFolder):
                count += len(files)
            if (count-2) != total:
                result["code"] = 404
                result["message"] = 'file is missing by count ' + \
                    str(count-2) + ' out of ' + str(total)

            # return result
            self.send_response(result["code"], result["message"])
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(
                {"missFiles": result["missFiles"]}).encode('utf-8'))
            return

        file = os.path.join("./UI/", path)
        mime = mimetypes.MimeTypes().guess_type(file)[0]

        self.send_response(200)
        # self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Type", mime)
        self.end_headers()

        with open(file, "rb") as f:
            self.wfile.write(f.read())


class serverThreadedHandler(ThreadingMixIn, HTTPServer):
    """Handle requests in a separate thread."""


def run():
    print('Starting Server...')
    server_address = ('', 8080)
    httpd = serverThreadedHandler(server_address, serverHandler)
    print('Running Server...')

    # os.startfile('UI\\index.htm', 'open')
    print("Open http://localhost:8080/ to view the application.")

    httpd.serve_forever()


run()

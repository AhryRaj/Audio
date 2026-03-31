class AudioAnalyzer {
    constructor() {
        this.recordings = [];
        this.audioContext = null;
        this.fillerDictionary = [
            'um', 'uh', 'like', 'hmm', 'ahh', 'er', 'erm', 'so', 'well',
            'you know', 'i mean', 'actually', 'basically'
        ];
    }

    async start(audioChunksArray, transcripts) {
        if (!audioChunksArray || !transcripts ||
            audioChunksArray.length !== transcripts.length) {
            console.error('Invalid input: Both arrays must be provided and have equal length');
            return { error: 'Invalid input parameters' };
        }

        console.log(`Starting analysis for ${audioChunksArray.length} recordings`);
        this.recordings = [];
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

        for (let index = 0; index < audioChunksArray.length; index++) {
            const transcript = transcripts[index];
            const audioChunks = audioChunksArray[index];

            if (!audioChunks || audioChunks.length === 0) {
                console.error(`No audio chunks provided for recording ${index}`);
                continue;
            }

            // Create audio blob
            const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
            const audioUrl = URL.createObjectURL(audioBlob);

            // Decode audio once for duration and gap detection
            let duration, audioBuffer;
            try {
                const arrayBuffer = await audioBlob.arrayBuffer();
                audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
                duration = audioBuffer.duration * 1000; // Duration in ms
            } catch (error) {
                console.error(`Error decoding audio for recording ${index}:`, error);
                continue;
            }

            // Process transcript for words and fillers
            const words = transcript.match(/\b\w+\b/g) || [];
            const fillerWords = [];
            const allWords = [];

            for (let i = 0; i < words.length; i++) {
                const word = words[i].toLowerCase();
                allWords.push({ word: word });
                if (this.fillerDictionary.includes(word)) {
                    fillerWords.push({ word: word });
                }
                if (i < words.length - 1) {
                    const bigram = `${word} ${words[i + 1].toLowerCase()}`;
                    if (this.fillerDictionary.includes(bigram)) {
                        fillerWords.push({ word: bigram });
                        i++;
                    }
                }
            }

            // Silence detection using cached audioBuffer
            let speechSegments = [];
            let breaks = [];
            try {
                const sampleRate = audioBuffer.sampleRate;

                // Setup analyser for frequency analysis
                const analyser = this.audioContext.createAnalyser();
                analyser.fftSize = 2048;
                const frequencyData = new Float32Array(analyser.frequencyBinCount);
                const timeDomainData = new Float32Array(analyser.fftSize);
                const frameSize = Math.floor(sampleRate * 0.1); // 100ms frames

                // Process audio in frames
                let isSpeaking = false;
                let speechStartTime = 0;
                speechSegments = [{ start: 0, end: null, duration: null }];

                for (let i = 0; i < audioBuffer.length; i += frameSize) {
                    const frameEnd = Math.min(i + frameSize, audioBuffer.length);
                    const currentTime = (i / sampleRate) * 1000; // Time in ms

                    // Extract frame data
                    const frameData = audioBuffer.getChannelData(0).slice(i, frameEnd);
                    const source = this.audioContext.createBufferSource();
                    const buffer = this.audioContext.createBuffer(1, frameData.length, sampleRate);
                    buffer.getChannelData(0).set(frameData);
                    source.buffer = buffer;
                    source.connect(analyser);
                    source.start();
                    source.stop(this.audioContext.currentTime + (frameData.length / sampleRate));

                    // Wait for frame processing
                    await new Promise(resolve => setTimeout(resolve, 10));

                    // Get frequency and time domain data
                    analyser.getFloatFrequencyData(frequencyData);
                    analyser.getFloatTimeDomainData(timeDomainData);

                    // Frequency energy (300-1000 Hz)
                    const binWidth = sampleRate / analyser.fftSize;
                    const startBin = Math.floor(300 / binWidth);
                    const endBin = Math.floor(1000 / binWidth);
                    let speechEnergy = 0;
                    for (let j = startBin; j <= endBin; j++) {
                        speechEnergy += Math.pow(10, frequencyData[j] / 10);
                    }
                    const avgSpeechEnergy = speechEnergy / (endBin - startBin + 1);

                    // RMS calculation
                    let rms = 0;
                    for (let j = 0; j < timeDomainData.length; j++) {
                        rms += timeDomainData[j] * timeDomainData[j];
                    }
                    rms = Math.sqrt(rms / timeDomainData.length);

                    // Adjusted threshold for silence
                    const isSpeakingNew = (avgSpeechEnergy > 0.0000005 && rms > 0.001);
                    console.log(`Recording ${index}, t=${currentTime.toFixed(0)}ms: avgSpeechEnergy=${avgSpeechEnergy.toFixed(8)}, RMS=${rms.toFixed(4)}, isSpeaking=${isSpeakingNew}`);

                    if (isSpeakingNew !== isSpeaking) {
                        if (isSpeakingNew) {
                            speechStartTime = currentTime;
                            if (speechSegments.length > 0 &&
                                currentTime - speechSegments[speechSegments.length - 1].end >= 2000) {
                                breaks.push({
                                    start: speechSegments[speechSegments.length - 1].end,
                                    end: currentTime,
                                    duration: currentTime - speechSegments[speechSegments.length - 1].end
                                });
                            }
                            speechSegments[speechSegments.length - 1].start = speechStartTime;
                        } else {
                            const segmentDuration = currentTime - speechStartTime;
                            if (segmentDuration > 200) {
                                speechSegments[speechSegments.length - 1].end = currentTime;
                                speechSegments[speechSegments.length - 1].duration = segmentDuration;
                                speechSegments.push({ start: null, end: null, duration: null });
                            }
                        }
                        isSpeaking = isSpeakingNew;
                    }

                    source.disconnect();
                }

                // Finalize last segment
                if (isSpeaking && speechStartTime < duration) {
                    const segmentDuration = duration - speechStartTime;
                    if (segmentDuration > 200) {
                        speechSegments[speechSegments.length - 1].end = duration;
                        speechSegments[speechSegments.length - 1].duration = segmentDuration;
                    }
                }
                speechSegments = speechSegments.filter(s => s.duration !== null);
            } catch (error) {
                console.error(`Error processing audio for recording ${index}:`, error);
                continue;
            }

            // Initialize recording object
            const recording = {
                speechData: {
                    speaking: isSpeaking,
                    speechStartTime: 0,
                    speechSegments,
                    breaks,
                    fillerWords,
                    words: allWords
                },
                transcript,
                startTime: 0,
                endTime: duration,
                audioBlob,
                audioUrl
            };
            this.recordings.push(recording);
            console.log(`Recording ${index}: Processed, Fillers: ${fillerWords.length}, Breaks: ${breaks.length}`);
        }

        if (this.recordings.length === 0) {
            console.error('No valid recordings processed');
            return { error: 'No valid recordings' };
        }
    }

    stop() {
        console.log('Generating analysis results');

        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close();
        }
        this.audioContext = null;

        if (this.recordings.length === 0) {
            console.warn('No recordings available');
            return { error: 'No recordings available' };
        }

        const allSpeechSegments = this.recordings.flatMap(r => r.speechData.speechSegments);
        const allBreaks = this.recordings.flatMap(r => r.speechData.breaks);
        const allFillers = this.recordings.flatMap(r => r.speechData.fillerWords);
        const allWords = this.recordings.flatMap(r => r.speechData.words);
        const allTranscripts = this.recordings.map(r => r.transcript).join(' ');
        const totalDuration = this.recordings.reduce((sum, r) => sum + r.endTime, 0) / 1000;

        if (allWords.length === 0 && !allTranscripts.trim()) {
            console.warn('No speech or transcript detected');
            return {
                error: 'No speech or transcript detected',
                score: 0,
                skillLevel: 'N/A',
                feedback: 'No data to analyze'
            };
        }

        // Calculate WPM using speech segments duration
        const words = allTranscripts.match(/\b\w+\b/g) || [];
        const fillerWords = words.filter(word => this.fillerDictionary.includes(word.toLowerCase()));
        const wordCount = words.length - fillerWords.length;
        const transcriptDuration = allSpeechSegments.reduce((sum, s) => sum + s.duration, 0) / 1000; // Use speech segments
        const wpm = transcriptDuration > 0 ?
            Math.round((wordCount / (transcriptDuration / 60)) * 10) / 10 : 0;

        let paceCategory = `${wpm} WPM`;
        let speechFeedbackText = "";
        if (wpm < 100) {
            paceCategory += " (Slow)";
            speechFeedbackText = "You speak slower than average. Try to increase your pace slightly.";
        } else if (wpm < 140) {
            paceCategory += " (Average)";
            speechFeedbackText = "Your pace is average. Maintain or slightly improve.";
        } else if (wpm < 180) {
            paceCategory += " (Fast)";
            speechFeedbackText = "You speak quickly. Ensure clarity.";
        } else {
            paceCategory += " (Very Fast)";
            speechFeedbackText = "Your pace is very fast. Slow down for clarity.";
        }

        const fillerCount = allFillers.length;
        let fillerFeedbackText = "";
        if (fillerCount === 0) {
            fillerFeedbackText = "No filler words detected. Excellent!";
        } else if (fillerCount < 5) {
            fillerFeedbackText = "Few filler words. Keep improving.";
        } else if (fillerCount < 10) {
            fillerFeedbackText = "Moderate filler words. Reduce usage.";
        } else {
            fillerFeedbackText = "Too many filler words. They can distract from your message.";
        }

        const gapFreq = totalDuration > 0 && allBreaks.length > 0 ?
            Math.round((allBreaks.length / (totalDuration / 60)) * 10) / 10 : 0;
        let gapFreqFeedbackText = "";
        if (gapFreq === 0) {
            gapFreqFeedbackText = "No gaps detected. Good flow!";
        } else if (gapFreq < 3) {
            gapFreqFeedbackText = "Few gaps. Well-paced.";
        } else if (gapFreq < 5) {
            gapFreqFeedbackText = "Some gaps. Consider reducing.";
        } else {
            gapFreqFeedbackText = "Too many gaps. Try to minimize.";
        }

        const avgGapDuration = allBreaks.length > 0 ?
            Math.round((allBreaks.reduce((sum, b) => sum + b.duration, 0) / allBreaks.length) / 1000 * 10) / 10 : 0;
        let gapDurFeedbackText = "";
        if (avgGapDuration === 0) {
            gapDurFeedbackText = "No gaps detected. Good flow!";
        } else if (avgGapDuration < 3) {
            gapDurFeedbackText = "Short gaps. Well-managed.";
        } else if (avgGapDuration < 5) {
            gapDurFeedbackText = "Moderate gap length. Consider shortening.";
        } else {
            gapDurFeedbackText = "Long gaps. Try to reduce duration.";
        }

        // Communication score
        let commScore = 0;
        if (wpm >= 120 && wpm <= 160) commScore += 25;
        else if (wpm >= 100 && wpm < 120 || wpm > 160 && wpm <= 180) commScore += 20;
        else if (wpm > 0) commScore += 15;
        if (fillerCount === 0) commScore += 30;
        else if (fillerCount < 5) commScore += 25;
        else if (fillerCount < 10) commScore += 20;
        else commScore += 10;
        if (gapFreq >= 2 && gapFreq <= 5 && avgGapDuration <= 5) commScore += 20;
        else if (gapFreq > 5 && gapFreq <= 7 && avgGapDuration <= 7) commScore += 15;
        else if (gapFreq > 0) commScore += 10;

        const skillLevel = this.getSkillLevel(commScore);
        const feedback = this.getFeedback(commScore);

        return {
            score: commScore,
            skillLevel,
            feedback,
            speechPace: paceCategory,
            speechFeedback: speechFeedbackText,
            breakFrequency: `${gapFreq} /min`,
            breakFreqFeedback: gapFreqFeedbackText,
            breakDuration: `${avgGapDuration} s`,
            breakDurFeedback: gapDurFeedbackText,
            fillerCount: `${fillerCount} used`,
            fillerFeedback: fillerFeedbackText
        };
    }

    getSkillLevel(score) {
        if (score >= 75) return 'Excellent';
        if (score >= 58) return 'Good';
        if (score >= 40) return 'Fair';
        return 'Poor';
    }

    getFeedback(score) {
        if (score >= 75) return "Your communication is outstanding. Keep it up!";
        if (score >= 58) return "Good communication. Focus on minor improvements.";
        if (score >= 40) return "Fair communication. Work on pace and fillers.";
        return "Your communication needs significant improvement. Focus on speaking more clearly and reducing filler words.";
    }
}